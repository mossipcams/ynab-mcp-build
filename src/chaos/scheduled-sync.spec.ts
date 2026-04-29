import { describe, expect, it } from "vitest";

import { runScheduledReadModelSync } from "../app/scheduled-sync.js";

describe("scheduled sync chaos", () => {
  it("returns a failed scheduled-sync result when default plan discovery fails", async () => {
    const result = await runScheduledReadModelSync(
      {
        MCP_SERVER_NAME: "ynab-mcp-build",
        MCP_SERVER_VERSION: "0.1.0",
        YNAB_ACCESS_TOKEN: "token",
        YNAB_API_BASE_URL: "https://api.ynab.com/v1",
        YNAB_DB: {} as D1Database,
        YNAB_READ_SOURCE: "d1"
      } as unknown as Env,
      Date.parse("2026-04-29T12:00:00.000Z"),
      {
        ynabClient: {
          listPlans: async () => {
            throw new Error("YNAB plan discovery unavailable");
          }
        }
      }
    );

    expect(result).toEqual({
      reason: "YNAB plan discovery unavailable",
      status: "failed"
    });
  });
});
