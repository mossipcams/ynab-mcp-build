import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Hono } from "hono";
import { z } from "zod";

import { OAuthConfigurationError, resolveOAuthCore, type AppDependencies } from "../../app/dependencies.js";
import { getRegisteredToolDefinitions } from "../../mcp/register-slices.js";
import { createMcpServer } from "../../mcp/server.js";
import { resolveAppEnv } from "../../shared/env.js";

type WorkerOAuthBindings = Env & {
  OAUTH_PROVIDER?: unknown;
};
function writeProtectedResourceAuthError(resourceMetadataUrl: string, errorDescription?: string) {
  return Response.json(
    {
      error: "invalid_token",
      ...(errorDescription ? { error_description: errorDescription } : {})
    },
    {
      headers: {
        "www-authenticate": `Bearer realm="mcp", resource_metadata="${resourceMetadataUrl}"`
      },
      status: 401
    }
  );
}

function writeProtectedResourceScopeError(resourceMetadataUrl: string, errorDescription: string) {
  return Response.json(
    {
      error: "insufficient_scope",
      error_description: errorDescription
    },
    {
      headers: {
        "www-authenticate": `Bearer realm="mcp", resource_metadata="${resourceMetadataUrl}", error="insufficient_scope"`
      },
      status: 403
    }
  );
}

function writeOAuthConfigurationError(error: unknown) {
  return Response.json(
    {
      error: "server_error",
      error_description: error instanceof Error ? error.message : String(error)
    },
    {
      status: 503
    }
  );
}

function writeJsonRpcInvalidParams(id: string | number | null, message: string) {
  return Response.json(
    {
      error: {
        code: -32602,
        message
      },
      id,
      jsonrpc: "2.0"
    },
    {
      status: 200
    }
  );
}

export function registerMcpRoutes(app: Hono<{ Bindings: Env }>, dependencies: AppDependencies = {}) {
  app.all("/mcp", async (context) => {
    const env = resolveAppEnv(context.env, context.req.raw);
    const providerAwareEnv = context.env as unknown as WorkerOAuthBindings;
    const usesWorkerOAuthProvider = "OAUTH_PROVIDER" in providerAwareEnv;
    let oauthCore;

    try {
      oauthCore = resolveOAuthCore(env, dependencies);
    } catch (error) {
      if (error instanceof OAuthConfigurationError) {
        return writeOAuthConfigurationError(error);
      }

      throw error;
    }

    if (oauthCore && !usesWorkerOAuthProvider) {
      const authorization = context.req.header("authorization");
      let tokenContext;

      if (!authorization?.startsWith("Bearer ")) {
        return writeProtectedResourceAuthError(oauthCore.protectedResourceMetadataEndpoint);
      }

      try {
        tokenContext = await oauthCore.verifyAccessToken(authorization.slice("Bearer ".length).trim());
      } catch (error) {
        return writeProtectedResourceAuthError(
          oauthCore.protectedResourceMetadataEndpoint,
          error instanceof Error ? error.message : String(error)
        );
      }

      if (!tokenContext.scopes.includes("mcp")) {
        return writeProtectedResourceScopeError(
          oauthCore.protectedResourceMetadataEndpoint,
          "Bearer token does not grant the mcp scope."
        );
      }
    }

    let parsedBody: unknown;

    if (context.req.method === "POST" && context.req.header("content-type")?.includes("application/json")) {
      try {
        parsedBody = await context.req.raw.clone().json();
      } catch {
        parsedBody = undefined;
      }
    }

    if (!Array.isArray(parsedBody) && parsedBody && typeof parsedBody === "object") {
      const request = parsedBody as {
        id?: number | string | null;
        method?: string;
        params?: {
          arguments?: Record<string, unknown>;
          name?: string;
        };
      };

      if (request.method === "tools/call" && typeof request.params?.name === "string") {
        const registeredToolDefinitions = getRegisteredToolDefinitions(env, dependencies);
        const matchingDefinition = registeredToolDefinitions.find(
          (definition) => definition.name === request.params?.name
        );

        if (!matchingDefinition) {
          return writeJsonRpcInvalidParams(request.id ?? null, `Tool ${request.params.name} not found`);
        }

        const parseResult = z.object(matchingDefinition.inputSchema).safeParse(request.params.arguments ?? {});

        if (!parseResult.success) {
          return writeJsonRpcInvalidParams(
            request.id ?? null,
            `Invalid arguments for tool ${request.params.name}: ${parseResult.error.message}`
          );
        }
      }
    }

    const namespace = providerAwareEnv.MCP_SESSION;

    if (!namespace) {
      const transport = new WebStandardStreamableHTTPServerTransport();
      const server = createMcpServer(env, dependencies);

      await server.connect(transport);

      return transport.handleRequest(context.req.raw, {
        ...(parsedBody !== undefined ? { parsedBody } : {})
      });
    }

    const sessionId = context.req.header("mcp-session-id");
    let stub: DurableObjectStub;

    if (sessionId) {
      try {
        stub = namespace.get(namespace.idFromString(sessionId));
      } catch {
        return new Response(
          JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Session not found" }, id: null }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }
    } else {
      stub = namespace.get(namespace.newUniqueId());
    }

    return stub.fetch(context.req.raw);
  });
}
