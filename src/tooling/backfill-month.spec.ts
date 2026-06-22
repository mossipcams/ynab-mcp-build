import { describe, expect, it, vi } from "vitest";

import { executeMonthBackfill } from "./backfill-month.js";

describe("backfill month tooling", () => {
  it("requires a plan id and month before creating clients", async () => {
    const createYnabClient = vi.fn();
    const createReadModelSyncRepository = vi.fn();
    const backfillPlanMonth = vi.fn();

    await expect(
      executeMonthBackfill({
        args: [],
        database: {} as D1Database,
        dependencies: {
          backfillPlanMonth,
          createReadModelSyncRepository,
          createYnabClient,
          now: () => "2026-06-22T12:00:00.000Z",
        },
        env: {
          YNAB_ACCESS_TOKEN: "token",
        },
      }),
    ).rejects.toThrow(
      "Backfill month requires --plan-id and --month arguments.",
    );

    expect(createYnabClient).not.toHaveBeenCalled();
    expect(createReadModelSyncRepository).not.toHaveBeenCalled();
    expect(backfillPlanMonth).not.toHaveBeenCalled();
  });

  it("calls the single-month detail backfill with configured YNAB and D1 clients", async () => {
    const upsertMonths = vi.fn(async () => ({
      monthCategoriesUpserted: 1,
      monthsUpserted: 1,
    }));
    const ynabClient = {};
    const readModelRepository = { upsertMonths };
    const createYnabClient = vi.fn(() => ynabClient);
    const createReadModelSyncRepository = vi.fn(() => readModelRepository);
    const backfillPlanMonth = vi.fn(async () => ({
      categoryCount: 1,
      month: "2026-06-01",
      monthCategoriesUpserted: 1,
      monthsUpserted: 1,
      planId: "plan-1",
    }));
    const database = {} as D1Database;

    await expect(
      executeMonthBackfill({
        args: ["--plan-id", "plan-1", "--month", "2026-06-01"],
        database,
        dependencies: {
          backfillPlanMonth,
          createReadModelSyncRepository,
          createYnabClient,
          now: () => "2026-06-22T12:00:00.000Z",
        },
        env: {
          YNAB_ACCESS_TOKEN: "token",
          YNAB_API_BASE_URL: "https://ynab.example/v1",
        },
      }),
    ).resolves.toEqual({
      categoryCount: 1,
      month: "2026-06-01",
      monthCategoriesUpserted: 1,
      monthsUpserted: 1,
      planId: "plan-1",
    });

    expect(createYnabClient).toHaveBeenCalledWith({
      accessToken: "token",
      baseUrl: "https://ynab.example/v1",
    });
    expect(createReadModelSyncRepository).toHaveBeenCalledWith(database);
    expect(backfillPlanMonth).toHaveBeenCalledWith({
      month: "2026-06-01",
      planId: "plan-1",
      readModelRepository,
      syncedAt: "2026-06-22T12:00:00.000Z",
      ynabClient,
    });
  });
});
