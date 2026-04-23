import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Hono } from "hono";
import { z } from "zod";

import type { AppDependencies } from "../../app/dependencies.js";
import { resolveOAuthCore } from "../../app/dependencies.js";
import { getRegisteredToolDefinitions } from "../../mcp/register-slices.js";
import { createMcpServer } from "../../mcp/server.js";
import { verifyCfAccessJwt } from "../../oauth/core/cf-access-jwt.js";
import { resolveAppEnv } from "../../shared/env.js";

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

function writeUnauthenticated() {
  return Response.json(
    { error: "unauthenticated", error_description: "Cloudflare Access authentication required." },
    { status: 401 }
  );
}

export function registerMcpRoutes(app: Hono<{ Bindings: Env }>, dependencies: AppDependencies = {}) {
  app.all("/mcp", async (context) => {
    const env = resolveAppEnv(context.env);

    if (env.cfAccessTeamDomain) {
      const cfJwt = context.req.header("cf-access-jwt-assertion");

      if (!cfJwt) {
        return writeUnauthenticated();
      }

      try {
        await verifyCfAccessJwt(cfJwt, env.cfAccessTeamDomain, {
          audience: env.cfAccessAudience
        });
      } catch {
        return writeUnauthenticated();
      }
    } else {
      const oauthCore = resolveOAuthCore(env, dependencies);

      if (oauthCore) {
        const authorization = context.req.header("authorization");

        if (!authorization?.startsWith("Bearer ")) {
          return writeProtectedResourceAuthError(oauthCore.protectedResourceMetadataEndpoint);
        }

        let tokenContext;

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

    const transport = new WebStandardStreamableHTTPServerTransport();
    const server = createMcpServer(env, dependencies);

    await server.connect(transport);

    return transport.handleRequest(context.req.raw, {
      ...(parsedBody !== undefined ? { parsedBody } : {})
    });
  });
}
