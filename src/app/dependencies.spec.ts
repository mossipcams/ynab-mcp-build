import { describe, expect, it } from "vitest";

import { resolveYnabClient } from "./dependencies.js";

describe("resolveYnabClient", () => {
  it("keeps YNAB access configured independently from OAuth provider storage", async () => {
    const client = resolveYnabClient(
      {
        mcpServerName: "ynab-mcp-build",
        mcpServerVersion: "0.1.0",
        oauthEnabled: true,
        publicUrl: "https://example.com/mcp",
        ynabApiBaseUrl: "https://api.ynab.com/v1",
        ynabReadSource: "live",
        ynabStaleAfterMinutes: 360,
        ynabSyncMaxRowsPerRun: 100
      },
      {}
    );

    await expect(client.getUser()).rejects.toThrow("YNAB access token is not configured.");
  });
});
