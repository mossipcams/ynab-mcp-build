import { describe, expect, it, vi } from "vitest";

import { backfillPlanMonth } from "./month-backfill.js";

describe("month backfill", () => {
  it("hydrates one month with category detail before upserting the read model", async () => {
    const getPlanMonth = vi.fn(async (_planId: string, month: string) => ({
      month,
      categoryCount: 1,
      categories: [
        {
          id: "category-1",
          name: "Groceries",
          categoryGroupName: "Everyday",
          budgeted: 100000,
          activity: -125000,
          balance: -25000,
          hidden: false,
          deleted: false,
        },
      ],
    }));
    const upsertMonths = vi.fn(async () => ({
      monthCategoriesUpserted: 1,
      monthsUpserted: 1,
    }));

    await expect(
      backfillPlanMonth({
        month: "2026-06-01",
        planId: "plan-1",
        readModelRepository: { upsertMonths },
        syncedAt: "2026-06-22T12:00:00.000Z",
        ynabClient: { getPlanMonth },
      }),
    ).resolves.toEqual({
      categoryCount: 1,
      month: "2026-06-01",
      monthCategoriesUpserted: 1,
      monthsUpserted: 1,
      planId: "plan-1",
    });

    expect(getPlanMonth).toHaveBeenCalledWith("plan-1", "2026-06-01");
    expect(upsertMonths).toHaveBeenCalledWith({
      months: [
        expect.objectContaining({
          categories: [
            expect.objectContaining({
              id: "category-1",
            }),
          ],
          month: "2026-06-01",
        }),
      ],
      planId: "plan-1",
      syncedAt: "2026-06-22T12:00:00.000Z",
    });
  });
});
