import { z } from "zod";
import { describe, expect, it } from "vitest";

import { validateToolCallRequest } from "./json-rpc-validation.js";

describe("validateToolCallRequest", () => {
  it("rejects malformed tool-call envelopes before tool argument parsing", async () => {
    const definitions = [
      {
        name: "ynab_get_account",
        title: "Get Account",
        description: "Gets an account",
        inputSchema: {
          accountId: z.string().min(1),
        },
        execute: () => ({}),
      },
    ];

    expect(
      validateToolCallRequest(
        {
          id: "request-1",
          jsonrpc: "2.0",
          method: "tools/call",
          params: "not-an-object",
        },
        definitions,
      ),
    ).toEqual({ kind: "not_tool_call" });

    const invalidArguments = validateToolCallRequest(
      {
        id: { nested: "not-a-json-rpc-id" },
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "ynab_get_account",
          arguments: [],
        },
      },
      definitions,
    );

    expect(invalidArguments.kind).toBe("invalid");

    if (invalidArguments.kind !== "invalid") {
      throw new Error("Expected invalid result");
    }

    await expect(invalidArguments.response.json()).resolves.toMatchObject({
      error: {
        code: -32602,
        message:
          "Invalid tool call request: id: Invalid input; params.arguments: Invalid input: expected record, received array",
      },
      id: null,
      jsonrpc: "2.0",
    });
  });

  it("formats Zod issues as concise field-level JSON-RPC invalid params errors", async () => {
    // DEFECT: raw Zod error messages can leak serialized issue arrays instead of a readable field error.
    const result = validateToolCallRequest(
      {
        id: "request-1",
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "ynab_get_account",
          arguments: {},
        },
      },
      [
        {
          name: "ynab_get_account",
          title: "Get Account",
          description: "Gets an account",
          inputSchema: {
            accountId: z.string().min(1),
          },
          execute: () => ({}),
        },
      ],
    );

    expect(result.kind).toBe("invalid");

    if (result.kind !== "invalid") {
      throw new Error("Expected invalid result");
    }

    await expect(result.response.json()).resolves.toMatchObject({
      error: {
        code: -32602,
        message:
          "Invalid arguments for tool ynab_get_account: accountId: Invalid input: expected string, received undefined",
      },
      id: "request-1",
      jsonrpc: "2.0",
    });
  });
});
