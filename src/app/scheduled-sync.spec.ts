import { describe, expect, it, vi } from "vitest";

import type { ReadModelSyncProfile } from "../platform/ynab/read-model/read-model-sync-service.js";
import {
  FULL_READ_MODEL_SYNC_CRON,
  HOT_READ_MODEL_SYNC_CRON,
  REFERENCE_READ_MODEL_SYNC_CRON,
  resolveScheduledSyncProfile,
  runScheduledReadModelSync,
} from "./scheduled-sync.js";

function createEnv() {
  return {
    MCP_SERVER_NAME: "ynab-mcp-build",
    MCP_SERVER_VERSION: "0.1.0",
    YNAB_ACCESS_TOKEN: "token",
    YNAB_API_BASE_URL: "https://api.ynab.com/v1",
    YNAB_DB: {} as D1Database,
    YNAB_DEFAULT_PLAN_ID: "plan-1",
    YNAB_READ_SOURCE: "d1",
  } as unknown as Env;
}

describe("scheduled read-model sync", () => {
  it.each([
    [HOT_READ_MODEL_SYNC_CRON, "hot_financial"],
    [REFERENCE_READ_MODEL_SYNC_CRON, "reference"],
    [FULL_READ_MODEL_SYNC_CRON, "full"],
    ["0 * * * *", "full"],
  ] satisfies Array<[string, ReadModelSyncProfile]>)(
    "resolves cron %s to the %s sync profile",
    (cron, profile) => {
      expect(resolveScheduledSyncProfile(cron)).toBe(profile);
    },
  );

  it("passes the resolved profile into the scheduled sync service", async () => {
    const createReadModelSyncService = vi.fn(() => ({ syncReadModel }));
    const syncReadModel = vi.fn(async () => ({
      endpointResults: [],
      profile: "hot_financial" as const,
      status: "ok" as const,
    }));

    await runScheduledReadModelSync(
      createEnv(),
      Date.parse("2026-04-29T12:00:00.000Z"),
      {
        createReadModelSyncService,
      },
      { cron: HOT_READ_MODEL_SYNC_CRON },
    );

    expect(createReadModelSyncService).toHaveBeenCalledWith(
      expect.objectContaining({
        syncRunRepository: {
          finishEndpointRun: expect.any(Function),
          startEndpointRun: expect.any(Function),
        },
      }),
    );
    expect(syncReadModel).toHaveBeenCalledWith({
      leaseOwner: "scheduled:1777464000000",
      now: "2026-04-29T12:00:00.000Z",
      planId: "plan-1",
      profile: "hot_financial",
    });
  });
});
