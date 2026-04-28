import { describe, expect, it, vi } from "vitest";

import { resolveYnabClient } from "./dependencies.js";
import { runScheduledReadModelSync } from "./scheduled-sync.js";

describe("resolveYnabClient", () => {
  it("keeps YNAB access configured independently from OAuth provider storage", async () => {
    const client = resolveYnabClient(
      {
        mcpServerName: "ynab-mcp-build",
        mcpServerVersion: "0.1.0",
        oauthEnabled: true,
        publicUrl: "https://example.com/mcp",
        ynabApiBaseUrl: "https://api.ynab.com/v1",
        ynabPopulateMaxRequestsPerRun: 50,
        ynabReadSource: "live",
        ynabStaleAfterMinutes: 360,
        ynabSyncMaxRowsPerRun: 100,
        ynabTempPopulationToolEnabled: false
      },
      {}
    );

    await expect(client.getUser()).rejects.toThrow("YNAB access token is not configured.");
  });
});

function createD1Env(overrides: Record<string, unknown> = {}) {
  return {
    YNAB_ACCESS_TOKEN: "pat-secret",
    YNAB_API_BASE_URL: "https://api.ynab.com/v1",
    YNAB_DB: {} as D1Database,
    YNAB_DEFAULT_PLAN_ID: "plan-1",
    YNAB_READ_SOURCE: "d1",
    YNAB_SYNC_MAX_ROWS_PER_RUN: "50",
    ...overrides
  } as unknown as Env;
}

describe("runScheduledReadModelSync", () => {
  it("builds and runs the read-model sync service for D1 deployments", async () => {
    const syncReadModel = vi.fn(async () => ({
      endpointResults: [],
      status: "ok" as const
    }));
    const ynabClient = {
      listPlans: vi.fn()
    };

    const createReadModelSyncService = vi.fn(() => ({
      syncReadModel
    }));
    const result = await runScheduledReadModelSync(createD1Env(), 1777406400000, {
      createReadModelSyncService,
      ynabClient
    });

    expect(ynabClient.listPlans).not.toHaveBeenCalled();
    expect(createReadModelSyncService).toHaveBeenCalledWith(expect.objectContaining({
      moneyMovementClient: expect.objectContaining({
        listMoneyMovementGroups: expect.any(Function),
        listMoneyMovements: expect.any(Function)
      })
    }));
    expect(syncReadModel).toHaveBeenCalledWith({
      leaseOwner: "scheduled:1777406400000",
      now: "2026-04-28T20:00:00.000Z",
      planId: "plan-1"
    });
    expect(result).toEqual({
      endpointResults: [],
      status: "ok"
    });
  });

  it("discovers the YNAB default plan when no default plan id is configured", async () => {
    const syncReadModel = vi.fn(async () => ({
      endpointResults: [],
      status: "ok" as const
    }));
    const ynabClient = {
      listPlans: vi.fn(async () => ({
        defaultPlan: {
          id: "plan-default",
          name: "Default Budget"
        },
        plans: [
          {
            id: "plan-default",
            name: "Default Budget"
          }
        ]
      }))
    };

    const result = await runScheduledReadModelSync(
      createD1Env({ YNAB_DEFAULT_PLAN_ID: undefined }),
      1777406400000,
      {
        createReadModelSyncService: vi.fn(() => ({
          syncReadModel
        })),
        ynabClient
      }
    );

    expect(ynabClient.listPlans).toHaveBeenCalledTimes(1);
    expect(syncReadModel).toHaveBeenCalledWith(expect.objectContaining({
      planId: "plan-default"
    }));
    expect(result).toEqual({
      endpointResults: [],
      status: "ok"
    });
  });

  it("falls back to the first YNAB plan when the API does not mark a default", async () => {
    const syncReadModel = vi.fn(async () => ({
      endpointResults: [],
      status: "ok" as const
    }));
    const ynabClient = {
      listPlans: vi.fn(async () => ({
        defaultPlan: null,
        plans: [
          {
            id: "plan-first",
            name: "First Budget"
          }
        ]
      }))
    };

    await runScheduledReadModelSync(
      createD1Env({ YNAB_DEFAULT_PLAN_ID: undefined }),
      1777406400000,
      {
        createReadModelSyncService: vi.fn(() => ({
          syncReadModel
        })),
        ynabClient
      }
    );

    expect(syncReadModel).toHaveBeenCalledWith(expect.objectContaining({
      planId: "plan-first"
    }));
  });

  it("fails clearly when no YNAB plan can be discovered", async () => {
    const createReadModelSyncService = vi.fn();

    const result = await runScheduledReadModelSync(
      createD1Env({ YNAB_DEFAULT_PLAN_ID: undefined }),
      1777406400000,
      {
        createReadModelSyncService,
        ynabClient: {
          listPlans: vi.fn(async () => ({
            defaultPlan: null,
            plans: []
          }))
        }
      }
    );

    expect(createReadModelSyncService).not.toHaveBeenCalled();
    expect(result).toEqual({
      reason: "No YNAB default plan was available for scheduled D1 sync.",
      status: "failed"
    });
  });

  it("skips safely outside D1 mode", async () => {
    const createReadModelSyncService = vi.fn();

    const result = await runScheduledReadModelSync(createD1Env({ YNAB_READ_SOURCE: "live" }), 1777406400000, {
      createReadModelSyncService
    });

    expect(createReadModelSyncService).not.toHaveBeenCalled();
    expect(result).toEqual({
      reason: "YNAB_READ_SOURCE is not d1.",
      status: "skipped"
    });
  });

  it("fails clearly when required sync bindings are missing", async () => {
    await expect(
      runScheduledReadModelSync(createD1Env({ YNAB_ACCESS_TOKEN: undefined }), 1777406400000, {
        createReadModelSyncService: vi.fn()
      })
    ).resolves.toEqual({
      reason: "YNAB_ACCESS_TOKEN is required for scheduled D1 sync.",
      status: "failed"
    });
  });
});
