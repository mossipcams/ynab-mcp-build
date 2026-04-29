import { z } from "zod";

import type { SliceToolDefinition } from "../shared/tool-definition.js";

type ToolCallValidationResult =
  | {
      kind: "invalid";
      response: Response;
    }
  | {
      kind: "not_tool_call" | "valid";
    };

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

function formatZodPath(path: PropertyKey[]) {
  if (path.length === 0) {
    return "arguments";
  }

  return path.map(String).join(".");
}

function formatZodError(error: z.ZodError) {
  return error.issues
    .map((issue) => `${formatZodPath(issue.path)}: ${issue.message}`)
    .join("; ");
}

export function validateToolCallRequest(
  parsedBody: unknown,
  definitions: readonly SliceToolDefinition[]
): ToolCallValidationResult {
  if (Array.isArray(parsedBody) || !parsedBody || typeof parsedBody !== "object") {
    return { kind: "not_tool_call" };
  }

  const request = parsedBody as {
    id?: number | string | null;
    method?: string;
    params?: {
      arguments?: Record<string, unknown>;
      name?: string;
    };
  };

  if (request.method !== "tools/call" || typeof request.params?.name !== "string") {
    return { kind: "not_tool_call" };
  }

  const matchingDefinition = definitions.find((definition) => definition.name === request.params?.name);

  if (!matchingDefinition) {
    return {
      kind: "invalid",
      response: writeJsonRpcInvalidParams(request.id ?? null, `Tool ${request.params.name} not found`)
    };
  }

  const parseResult = z.object(matchingDefinition.inputSchema).safeParse(request.params.arguments ?? {});

  if (!parseResult.success) {
    return {
      kind: "invalid",
      response: writeJsonRpcInvalidParams(
        request.id ?? null,
        `Invalid arguments for tool ${request.params.name}: ${formatZodError(parseResult.error)}`
      )
    };
  }

  return { kind: "valid" };
}
