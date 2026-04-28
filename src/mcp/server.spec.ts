import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppDependencies } from "../app/dependencies.js";
import type { AppEnv } from "../shared/env.js";
import type { SliceToolDefinition } from "../shared/tool-definition.js";

const mocks = vi.hoisted(() => ({
  createdServers: [] as Array<{ config: unknown }>,
  registerSlices: vi.fn(),
  registerToolDefinitions: vi.fn()
}));

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class {
    constructor(config: unknown) {
      mocks.createdServers.push({ config });
    }
  }
}));

vi.mock("./register-slices.js", () => ({
  registerSlices: mocks.registerSlices
}));

vi.mock("./tool-registry.js", () => ({
  registerToolDefinitions: mocks.registerToolDefinitions
}));

describe("createMcpServer", () => {
  beforeEach(() => {
    mocks.createdServers.length = 0;
    mocks.registerSlices.mockReset();
    mocks.registerToolDefinitions.mockReset();
  });

  it("creates an MCP server with env-backed identity and explicit tool definitions", async () => {
    const { createMcpServer } = await import("./server.js");
    const env = {
      mcpServerName: "ynab-mcp-test",
      mcpServerVersion: "1.2.3"
    } as AppEnv;
    const toolDefinitions: SliceToolDefinition[] = [
      {
        name: "ynab_get_demo",
        title: "Get demo",
        description: "Reads demo.",
        inputSchema: {
          id: z.string()
        },
        execute: async () => ({ ok: true })
      }
    ];

    const server = createMcpServer(env, {}, toolDefinitions);

    expect(mocks.createdServers).toEqual([
      {
        config: {
          name: "ynab-mcp-test",
          version: "1.2.3"
        }
      }
    ]);
    expect(mocks.registerToolDefinitions).toHaveBeenCalledWith(server, toolDefinitions);
    expect(mocks.registerSlices).not.toHaveBeenCalled();
  });

  it("registers configured slices when explicit tool definitions are absent", async () => {
    const { createMcpServer } = await import("./server.js");
    const env = {
      mcpServerName: "ynab-mcp-test",
      mcpServerVersion: "1.2.3"
    } as AppEnv;
    const dependencies = {
      fetch: vi.fn()
    } as AppDependencies;

    const server = createMcpServer(env, dependencies);

    expect(mocks.registerSlices).toHaveBeenCalledWith(server, env, dependencies);
    expect(mocks.registerToolDefinitions).not.toHaveBeenCalled();
  });
});
