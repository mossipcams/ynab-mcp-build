import { describe, expect, it, vi } from "vitest";

import {
  getCategory,
  getPlanMonth,
  listPlanMonths,
  listPlans,
} from "./service.js";

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
        activity_milliunits: -6090860,
        budgeted_milliunits: 4092500,
        category_count: 2,
        month: "2026-04-01",
      },
    });
  });

  it("returns formatted month money with raw milliunit fields", async () => {
    const ynabClient = {
      getPlanMonth: vi.fn().mockResolvedValue({
        ageOfMoney: 12,
        activity: -6090860,
        budgeted: 4092500,
        categoryCount: 2,
        income: 7012345,
        month: "2026-04-01",
        toBeBudgeted: -12345,
      }),
    };

    await expect(
      getPlanMonth(ynabClient as never, "plan-1", "2026-04-01"),
    ).resolves.toMatchObject({
      month: {
        activity: "-6090.86",
        activity_milliunits: -6090860,
        budgeted: "4092.50",
        budgeted_milliunits: 4092500,
        income: "7012.35",
        income_milliunits: 7012345,
        to_be_budgeted: "-12.35",
        to_be_budgeted_milliunits: -12345,
      },
    });
  });

  it("returns formatted list month money with raw milliunit fields", async () => {
    const ynabClient = {
      listPlanMonths: vi.fn().mockResolvedValue([
        {
          activity: -1005,
          budgeted: 2005,
          deleted: false,
          income: 3005,
          month: "2026-04-01",
          toBeBudgeted: 4005,
        },
      ]),
    };

    await expect(
      listPlanMonths(ynabClient as never, "plan-1"),
    ).resolves.toMatchObject({
      months: [
        {
          activity: "-1.01",
          activity_milliunits: -1005,
          budgeted: "2.01",
          budgeted_milliunits: 2005,
          income: "3.01",
          income_milliunits: 3005,
          to_be_budgeted: "4.01",
          to_be_budgeted_milliunits: 4005,
        },
      ],
    });
  });

  it("returns formatted category money with raw milliunit fields", async () => {
    const ynabClient = {
      getCategory: vi.fn().mockResolvedValue({
        balance: 12345,
        categoryGroupName: "Bills",
        goalTarget: 250050,
        goalType: "TB",
        hidden: false,
        id: "category-1",
        name: "Rent",
      }),
    };

    await expect(
      getCategory(ynabClient as never, "plan-1", "category-1"),
    ).resolves.toMatchObject({
      category: {
        balance: "12.35",
        balance_milliunits: 12345,
        goal_target: "250.05",
        goal_target_milliunits: 250050,
      },
    });
  });

  it("returns formatted month category money with raw milliunit fields", async () => {
    const ynabClient = {
      getMonthCategory: vi.fn().mockResolvedValue({
        activity: -1005,
        balance: 2005,
        budgeted: 3005,
        categoryGroupName: "Bills",
        goalTarget: 4005,
        goalType: "TB",
        goalUnderFunded: 5005,
        hidden: false,
        id: "category-1",
        name: "Rent",
      }),
    };

    await expect(
      getCategory(ynabClient as never, "plan-1", "category-1", "2026-04-01"),
    ).resolves.toMatchObject({
      category: {
        activity: "-1.01",
        activity_milliunits: -1005,
        balance: "2.01",
        balance_milliunits: 2005,
        budgeted: "3.01",
        budgeted_milliunits: 3005,
        goal_target: "4.01",
        goal_target_milliunits: 4005,
        goal_under_funded: "5.01",
        goal_under_funded_milliunits: 5005,
      },
    });
  });
});
