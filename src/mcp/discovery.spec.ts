import { describe, expect, it } from "vitest";

import type { AppEnv } from "../shared/env.js";
import { buildDiscoveryDocument, DISCOVERY_TOOL_NAMES } from "./discovery.js";

describe("MCP discovery document", () => {
  it("publishes server identity, streamable HTTP endpoints, and a copy of tool names", () => {
    const document = buildDiscoveryDocument({
      mcpServerName: "ynab-mcp-test",
      mcpServerVersion: "1.2.3"
    } as AppEnv);

    expect(document).toEqual({
      name: "ynab-mcp-test",
      version: "1.2.3",
      protocol: {
        transport: "streamable-http"
      },
      endpoints: {
        mcp: "/mcp",
        wellKnown: "/.well-known/mcp.json"
      },
      tools: {
        count: DISCOVERY_TOOL_NAMES.length,
        names: [...DISCOVERY_TOOL_NAMES]
      }
    });
    expect(document.tools.names).not.toBe(DISCOVERY_TOOL_NAMES);
  });
});
