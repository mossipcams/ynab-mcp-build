import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Hono } from "hono";

import type { AppDependencies } from "../../app/dependencies.js";
import { getRegisteredToolDefinitions } from "../../app/tool-definitions.js";
import { validateToolCallRequest } from "../../mcp/json-rpc-validation.js";
import { createMcpServer } from "../../mcp/server.js";
import { resolveAppEnv } from "../../shared/env.js";

const MCP_JSON_BODY_LIMIT_BYTES = 1024 * 1024;

type JsonBodyReadResult =
  | {
      kind: "invalid";
    }
  | {
      kind: "parsed";
      value: unknown;
    }
  | {
      kind: "too_large";
    };

function writeRequestTooLarge() {
  return Response.json(
    {
      error: "request_too_large",
      error_description: `MCP JSON body exceeds ${MCP_JSON_BODY_LIMIT_BYTES} bytes.`,
    },
    {
      status: 413,
    },
  );
}

function writeMcpRequestFailure(error: unknown) {
  return Response.json(
    {
      error: "mcp_request_failed",
      error_description:
        error instanceof Error ? error.message : "MCP request failed.",
    },
    {
      status: 500,
    },
  );
}

async function readBoundedJsonBody(
  request: Request,
): Promise<JsonBodyReadResult> {
  const contentLength = request.headers.get("content-length");

  if (contentLength && Number(contentLength) > MCP_JSON_BODY_LIMIT_BYTES) {
    return { kind: "too_large" };
  }

  const reader = request.clone().body?.getReader();

  if (!reader) {
    return { kind: "invalid" };
  }

  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  for (;;) {
    const result = await reader.read();

    if (result.done) {
      break;
    }

    byteLength += result.value.byteLength;

    if (byteLength > MCP_JSON_BODY_LIMIT_BYTES) {
      await reader.cancel();

      return { kind: "too_large" };
    }

    chunks.push(result.value);
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return {
      kind: "parsed",
      value: JSON.parse(new TextDecoder().decode(bytes)),
    };
  } catch {
    return { kind: "invalid" };
  }
}

export function registerMcpRoutes(
  app: Hono<{ Bindings: Env }>,
  dependencies: AppDependencies = {},
) {
  app.all("/mcp", async (context) => {
    try {
      const env = resolveAppEnv(context.env, context.req.raw);
      let parsedBody: unknown;

      if (
        context.req.method === "POST" &&
        context.req.header("content-type")?.includes("application/json")
      ) {
        const body = await readBoundedJsonBody(context.req.raw);

        if (body.kind === "too_large") {
          return writeRequestTooLarge();
        }

        if (body.kind === "parsed") {
          parsedBody = body.value;
        }
      }

      const registeredToolDefinitions = getRegisteredToolDefinitions(
        env,
        dependencies,
      );
      const validation = validateToolCallRequest(
        parsedBody,
        registeredToolDefinitions,
      );

      if (validation.kind === "invalid") {
        return validation.response;
      }

      const transport = new WebStandardStreamableHTTPServerTransport();
      const server = createMcpServer(env, registeredToolDefinitions);

      await server.connect(transport);

      const requestOptions = parsedBody !== undefined ? { parsedBody } : {};

      return transport.handleRequest(context.req.raw, requestOptions);
    } catch (error) {
      return writeMcpRequestFailure(error);
    }
  });
}
