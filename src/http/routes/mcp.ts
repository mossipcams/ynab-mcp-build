import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Hono } from "hono";

import type { AppDependencies } from "../../app/dependencies.js";
import { createMcpServer } from "../../mcp/server.js";
import { resolveAppEnv } from "../../shared/env.js";
import { resolveOAuthCore } from "../../app/dependencies.js";

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

export function registerMcpRoutes(app: Hono<{ Bindings: Env }>, dependencies: AppDependencies = {}) {
  app.all("/mcp", async (context) => {
    const env = resolveAppEnv(context.env);
    const oauthCore = resolveOAuthCore(env, dependencies);

    if (oauthCore) {
      const authorization = context.req.header("authorization");

      if (!authorization?.startsWith("Bearer ")) {
        return writeProtectedResourceAuthError(oauthCore.protectedResourceMetadataEndpoint);
      }

      try {
        await oauthCore.verifyAccessToken(authorization.slice("Bearer ".length).trim());
      } catch (error) {
        return writeProtectedResourceAuthError(
          oauthCore.protectedResourceMetadataEndpoint,
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    const namespace = (context.env as any)?.MCP_SESSION as DurableObjectNamespace | undefined;

    if (!namespace) {
      // Fallback path for test environments without a DO binding.
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      const server = createMcpServer(env, dependencies);
      await server.connect(transport);
      return transport.handleRequest(context.req.raw);
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
