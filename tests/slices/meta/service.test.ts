import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { getMcpVersion, getUser } from "../../../src/slices/meta/service.js";
import { getMetaToolDefinitions } from "../../../src/slices/meta/tools.js";

describe("meta service", () => {
  it("returns env-backed MCP version metadata", () => {
    // DEFECT: the meta slice can drift from worker env metadata and report the wrong deployment identity.
    const result = getMcpVersion({
      mcpServerName: "ynab-mcp-build",
      mcpServerVersion: "0.1.0",
      oauthEnabled: false,
      ynabApiBaseUrl: "https://api.ynab.com/v1",
    });

    expect(result).toEqual({
      name: "ynab-mcp-build",
      version: "0.1.0",
    });
  });

  it("wraps the YNAB user in the documented meta service response shape", async () => {
    // DEFECT: the meta slice can leak raw platform responses instead of the stable service envelope expected by tool formatting.
    const ynabClient = {
      getUser: vi.fn().mockResolvedValue({
        id: "user-1",
        name: "Casey Budgeter",
      }),
    };

    await expect(getUser(ynabClient as never)).resolves.toEqual({
      user: {
        id: "user-1",
        name: "Casey Budgeter",
      },
    });
    expect(ynabClient.getUser).toHaveBeenCalledOnce();
  });

  it("publishes stable meta tool definitions with executable handlers", async () => {
    // DEFECT: meta tool definitions can drift away from their documented names or stop invoking the intended service handlers.
    const env = {
      mcpServerName: "ynab-mcp-build",
      mcpServerVersion: "0.1.0",
      oauthEnabled: false,
      ynabApiBaseUrl: "https://api.ynab.com/v1",
    };
    const ynabClient = {
      getUser: vi.fn().mockResolvedValue({
        id: "user-1",
        name: "Casey Budgeter",
      }),
    };
    const definitions = getMetaToolDefinitions(
      env as never,
      ynabClient as never,
    );
    const versionTool = definitions.find(
      (definition) => definition.name === "ynab_get_mcp_version",
    );
    const userTool = definitions.find(
      (definition) => definition.name === "ynab_get_user",
    );

    expect(definitions.map((definition) => definition.name).sort()).toEqual([
      "ynab_get_mcp_version",
      "ynab_get_user",
    ]);
    expect(versionTool).toBeDefined();
    expect(userTool).toBeDefined();
    expect(z.object(versionTool?.inputSchema ?? {}).parse({})).toEqual({});
    expect(z.object(userTool?.inputSchema ?? {}).parse({})).toEqual({});
    await expect(versionTool?.execute({})).resolves.toEqual({
      name: "ynab-mcp-build",
      version: "0.1.0",
    });
    await expect(userTool?.execute({})).resolves.toEqual({
      user: {
        id: "user-1",
        name: "Casey Budgeter",
      },
    });
  });
});
