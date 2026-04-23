import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Hono } from "hono";

import type { AppDependencies } from "../../app/dependencies.js";
import { createMcpServer } from "../../mcp/server.js";
import { resolveAppEnv } from "../../shared/env.js";

export function registerMcpRoutes(app: Hono<{ Bindings: Env }>, dependencies: AppDependencies = {}) {
  app.all("/mcp", async (context) => {
    const env = resolveAppEnv(context.env);

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
