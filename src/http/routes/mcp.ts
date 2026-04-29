import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Hono } from "hono";

import type { AppDependencies } from "../../app/dependencies.js";
import { getRegisteredToolDefinitions } from "../../app/tool-definitions.js";
import { validateToolCallRequest } from "../../mcp/json-rpc-validation.js";
import { createMcpServer } from "../../mcp/server.js";
import { resolveAppEnv } from "../../shared/env.js";

export function registerMcpRoutes(app: Hono<{ Bindings: Env }>, dependencies: AppDependencies = {}) {
  app.all("/mcp", async (context) => {
    const env = resolveAppEnv(context.env, context.req.raw);
    const registeredToolDefinitions = getRegisteredToolDefinitions(env, dependencies);
    let parsedBody: unknown;

    if (context.req.method === "POST" && context.req.header("content-type")?.includes("application/json")) {
      try {
        parsedBody = await context.req.raw.clone().json();
      } catch {
        parsedBody = undefined;
      }
    }

    const validation = validateToolCallRequest(parsedBody, registeredToolDefinitions);

    if (validation.kind === "invalid") {
      return validation.response;
    }

    const transport = new WebStandardStreamableHTTPServerTransport();
    const server = createMcpServer(env, registeredToolDefinitions);

    await server.connect(transport);

    return transport.handleRequest(context.req.raw, {
      ...(parsedBody !== undefined ? { parsedBody } : {})
    });
  });
}
