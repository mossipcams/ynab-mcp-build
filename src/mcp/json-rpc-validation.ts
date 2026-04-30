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

const JsonRpcIdSchema = z.union([z.string(), z.number(), z.null()]);

const PotentialToolCallRequestSchema = z
  .object({
    method: z.literal("tools/call"),
    params: z
      .object({
        name: z.string(),
      })
      .passthrough(),
  })
  .passthrough();

const ToolCallRequestSchema = z
  .object({
    id: JsonRpcIdSchema.optional(),
    method: z.literal("tools/call"),
    params: z
      .object({
        arguments: z.record(z.string(), z.unknown()).optional(),
        name: z.string(),
      })
      .passthrough(),
  })
  .passthrough();

function writeJsonRpcInvalidParams(
  id: string | number | null,
  message: string,
) {
  return Response.json(
    {
      error: {
        code: -32602,
        message,
      },
      id,
      jsonrpc: "2.0",
    },
    {
      status: 200,
    },
  );
}

function formatZodPath(path: PropertyKey[]) {
  if (path.length === 0) {
    return "arguments";
  }

  return path.map(String).join(".");
}

function getJsonRpcId(parsedBody: unknown) {
  const id = z
    .object({
      id: JsonRpcIdSchema.optional(),
    })
    .passthrough()
    .safeParse(parsedBody);

  return id.success ? (id.data.id ?? null) : null;
}

function formatZodError(error: z.ZodError) {
  return error.issues
    .map((issue) => `${formatZodPath(issue.path)}: ${issue.message}`)
    .join("; ");
}

export function validateToolCallRequest(
  parsedBody: unknown,
  definitions: readonly SliceToolDefinition[],
): ToolCallValidationResult {
  const potentialRequest = PotentialToolCallRequestSchema.safeParse(parsedBody);

  if (!potentialRequest.success) {
    return { kind: "not_tool_call" };
  }

  const request = ToolCallRequestSchema.safeParse(parsedBody);

  if (!request.success) {
    return {
      kind: "invalid",
      response: writeJsonRpcInvalidParams(
        getJsonRpcId(parsedBody),
        `Invalid tool call request: ${formatZodError(request.error)}`,
      ),
    };
  }

  const matchingDefinition = definitions.find(
    (definition) => definition.name === request.data.params.name,
  );

  if (!matchingDefinition) {
    return {
      kind: "invalid",
      response: writeJsonRpcInvalidParams(
        request.data.id ?? null,
        `Tool ${request.data.params.name} not found`,
      ),
    };
  }

  const parseResult = z
    .object(matchingDefinition.inputSchema)
    .safeParse(request.data.params.arguments ?? {});

  if (!parseResult.success) {
    return {
      kind: "invalid",
      response: writeJsonRpcInvalidParams(
        request.data.id ?? null,
        `Invalid arguments for tool ${request.data.params.name}: ${formatZodError(parseResult.error)}`,
      ),
    };
  }

  return { kind: "valid" };
}
