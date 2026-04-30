import { describe, expect, it } from "vitest";

import { getRegisteredToolDefinitions } from "../../../src/app/tool-definitions.js";
import { buildDiscoveryDocument } from "../../../src/mcp/discovery.js";
import type { AppEnv } from "../../../src/shared/env.js";

class FakeD1Database {
  prepare() {
    throw new Error("Meta surface tests should not query D1.");
  }
}

function createD1Env(): AppEnv {
  return {
    mcpServerName: "ynab-mcp-build",
    mcpServerVersion: "0.1.0",
    oauthEnabled: false,
    ynabApiBaseUrl: "https://api.ynab.com/v1",
    ynabDatabase: new FakeD1Database() as unknown as D1Database,
    ynabDefaultPlanId: "plan-1",
    ynabReadSource: "d1",
    ynabStaleAfterMinutes: 360,
  };
}

describe("meta surface", () => {
  it("keeps server identity in discovery instead of exposing diagnostic tools", () => {
    const document = buildDiscoveryDocument(createD1Env());
    const registeredNames = getRegisteredToolDefinitions(createD1Env(), {}).map(
      (definition) => definition.name,
    );

    expect(document).toMatchObject({
      name: "ynab-mcp-build",
      version: "0.1.0",
    });
    expect(document.tools.names).not.toContain("ynab_get_mcp_version");
    expect(document.tools.names).not.toContain("ynab_get_user");
    expect(registeredNames).not.toContain("ynab_get_mcp_version");
    expect(registeredNames).not.toContain("ynab_get_user");
  });
});
