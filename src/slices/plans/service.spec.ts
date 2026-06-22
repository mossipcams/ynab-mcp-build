import { describe, expect, it, vi } from "vitest";

import { getPlanMonth, listPlans } from "./service.js";

describe("plans service", () => {
  it("returns YNAB's default plan when one is provided", async () => {
    const ynabClient = {
      listPlans: vi.fn().mockResolvedValue({
        defaultPlan: {
          id: "plan-default",
          name: "Default",
        },
        plans: [
          { id: "plan-1", name: "One" },
          { id: "plan-default", name: "Default" },
        ],
      }),
    };

    await expect(listPlans(ynabClient as never)).resolves.toMatchObject({
      default_plan: {
        id: "plan-default",
        name: "Default",
      },
    });
  });

  it("returns the only plan as default when YNAB provides no default", async () => {
    const ynabClient = {
      listPlans: vi.fn().mockResolvedValue({
        defaultPlan: null,
        plans: [{ id: "plan-only", name: "Only plan" }],
      }),
    };

    await expect(listPlans(ynabClient as never)).resolves.toMatchObject({
      default_plan: {
        id: "plan-only",
        name: "Only plan",
      },
    });
  });

  it("does not return a default plan when multiple plans exist without a YNAB default", async () => {
    const ynabClient = {
      listPlans: vi.fn().mockResolvedValue({
        defaultPlan: null,
        plans: [
          { id: "plan-1", name: "One" },
          { id: "plan-2", name: "Two" },
        ],
      }),
    };

    await expect(listPlans(ynabClient as never)).resolves.toMatchObject({
      default_plan: null,
    });
  });

  it("returns month category count from hydrated read-model month detail", async () => {
    const ynabClient = {
      getPlanMonth: vi.fn().mockResolvedValue({
        activity: -6090860,
        budgeted: 4092500,
        categoryCount: 2,
        month: "2026-04-01",
        toBeBudgeted: 0,
      }),
    };

    await expect(
      getPlanMonth(ynabClient as never, "plan-1", "2026-04-01"),
    ).resolves.toMatchObject({
      month: {
        activity: -6090860,
        budgeted: 4092500,
        category_count: 2,
        month: "2026-04-01",
      },
    });
  });
});
