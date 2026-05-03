import { describe, expect, it, vi } from "vitest";

import {
  runScheduledReadModelSync,
  runScheduledReadModelSyncAndReport,
} from "./scheduled-sync.js";

function createD1Env(overrides: Record<string, unknown> = {}) {
  return {
    YNAB_ACCESS_TOKEN: "pat-secret",
    YNAB_API_BASE_URL: "https://api.ynab.com/v1",
    YNAB_DB: {} as D1Database,
    YNAB_DEFAULT_PLAN_ID: "plan-1",
    YNAB_READ_SOURCE: "d1",
    ...overrides,
  } as unknown as Env;
}

function createOkSyncResult() {
  return {
    endpointResults: [],
    profile: "full" as const,
    status: "ok" as const,
  };
}

describe("runScheduledReadModelSync", () => {
  it("builds and runs the read-model sync service for D1 deployments", async () => {
    const syncReadModel = vi.fn(async () => createOkSyncResult());
    const ynabClient = {
      listPlans: vi.fn(),
    };

    const createReadModelSyncService = vi.fn(() => ({
      syncReadModel,
    }));
    const result = await runScheduledReadModelSync(
      createD1Env(),
      1777406400000,
      {
        createReadModelSyncService,
        ynabClient,
      },
    );

    expect(ynabClient.listPlans).not.toHaveBeenCalled();
    expect(createReadModelSyncService).toHaveBeenCalledWith(
      expect.objectContaining({
        metadataClient: expect.objectContaining({
          getPlan: expect.any(Function),
          getPlanSettings: expect.any(Function),
          getUser: expect.any(Function),
          listPlans: expect.any(Function),
        }),
        moneyMovementClient: expect.objectContaining({
          listMoneyMovementGroups: expect.any(Function),
          listMoneyMovements: expect.any(Function),
        }),
      }),
    );
    expect(syncReadModel).toHaveBeenCalledWith({
      leaseOwner: "scheduled:1777406400000",
      now: "2026-04-28T20:00:00.000Z",
      planId: "plan-1",
    });
    expect(result).toEqual({
      endpointResults: [],
      profile: "full",
      status: "ok",
    });
  });

  it("discovers the YNAB default plan when no default plan id is configured", async () => {
    const syncReadModel = vi.fn(async () => createOkSyncResult());
    const ynabClient = {
      listPlans: vi.fn(async () => ({
        defaultPlan: {
          id: "plan-default",
          name: "Default Budget",
        },
        plans: [
          {
            id: "plan-default",
            name: "Default Budget",
          },
        ],
      })),
    };

    const result = await runScheduledReadModelSync(
      createD1Env({ YNAB_DEFAULT_PLAN_ID: undefined }),
      1777406400000,
      {
        createReadModelSyncService: vi.fn(() => ({
          syncReadModel,
        })),
        ynabClient,
      },
    );

    expect(ynabClient.listPlans).toHaveBeenCalledTimes(1);
    expect(syncReadModel).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: "plan-default",
      }),
    );
    expect(result).toEqual({
      endpointResults: [],
      profile: "full",
      status: "ok",
    });
  });

  it("falls back to the first YNAB plan when the API does not mark a default", async () => {
    const syncReadModel = vi.fn(async () => createOkSyncResult());
    const ynabClient = {
      listPlans: vi.fn(async () => ({
        defaultPlan: null,
        plans: [
          {
            id: "plan-first",
            name: "First Budget",
          },
        ],
      })),
    };

    await runScheduledReadModelSync(
      createD1Env({ YNAB_DEFAULT_PLAN_ID: undefined }),
      1777406400000,
      {
        createReadModelSyncService: vi.fn(() => ({
          syncReadModel,
        })),
        ynabClient,
      },
    );

    expect(syncReadModel).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: "plan-first",
      }),
    );
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
            plans: [],
          })),
        },
      },
    );

    expect(createReadModelSyncService).not.toHaveBeenCalled();
    expect(result).toEqual({
      reason: "No YNAB default plan was available for scheduled D1 sync.",
      status: "failed",
    });
  });

  it("fails clearly when required sync bindings are missing", async () => {
    await expect(
      runScheduledReadModelSync(
        createD1Env({ YNAB_ACCESS_TOKEN: undefined }),
        1777406400000,
        {
          createReadModelSyncService: vi.fn(),
        },
      ),
    ).resolves.toEqual({
      reason: "YNAB_ACCESS_TOKEN is required for scheduled D1 sync.",
      status: "failed",
    });
  });

  it("rejects reported scheduled sync failures so cron waitUntil surfaces them", async () => {
    await expect(
      runScheduledReadModelSyncAndReport(
        createD1Env({ YNAB_ACCESS_TOKEN: undefined }),
        1777406400000,
        {
          createReadModelSyncService: vi.fn(),
        },
      ),
    ).rejects.toThrow(
      "Scheduled D1 sync failed: YNAB_ACCESS_TOKEN is required for scheduled D1 sync.",
    );
  });

  it("labels scheduled plan discovery failures before reporting them", async () => {
    await expect(
      runScheduledReadModelSyncAndReport(
        createD1Env({ YNAB_DEFAULT_PLAN_ID: undefined }),
        1777406400000,
        {
          createReadModelSyncService: vi.fn(),
          ynabClient: {
            listPlans: vi.fn(async () => {
              throw new Error(
                "YNAB API response did not match expected schema.",
              );
            }),
          },
        },
      ),
    ).rejects.toThrow(
      "Scheduled D1 sync failed: plan_discovery: YNAB API response did not match expected schema.",
    );
  });
});
