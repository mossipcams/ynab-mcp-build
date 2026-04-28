import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Hono } from "hono";
import { z } from "zod";

import type { AppDependencies } from "../../app/dependencies.js";
import { getRegisteredToolDefinitions } from "../../mcp/register-slices.js";
import { createMcpServer } from "../../mcp/server.js";
import { resolveAppEnv } from "../../shared/env.js";

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

        const transport = new WebStandardStreamableHTTPServerTransport();
        const server = createMcpServer(env, dependencies, registeredToolDefinitions);

        await server.connect(transport);

        return transport.handleRequest(context.req.raw, {
          ...(parsedBody !== undefined ? { parsedBody } : {})
        });
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
