import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  buildAccountSnapshotSummary,
  buildAssignedSpentSummary,
  buildVisibleCategoryHealthSummary,
  toSpentMilliunits,
} from "../../../src/slices/financial-health/helpers.js";
import { getFinancialHealthToolDefinitions } from "../../../src/slices/financial-health/tools.js";

describe("financial health helpers", () => {
  it("builds account snapshots from active non-deleted accounts only", () => {
    // DEFECT: deleted or closed accounts can leak into financial snapshots and inflate cash or net worth summaries.
    const summary = buildAccountSnapshotSummary([
      {
        id: "account-1",
        name: "Checking",
        balance: 100_000,
        deleted: false,
        closed: false,
        onBudget: true,
      },
      {
        id: "account-2",
        name: "Credit Card",
        balance: -25_000,
        deleted: false,
        closed: false,
        onBudget: true,
      },
      {
        id: "account-3",
        name: "Archived",
        balance: 500_000,
        deleted: true,
        closed: false,
        onBudget: true,
      },
    ]);

    expect(summary.netWorthMilliunits).toBe(75_000);
    expect(summary.liquidCashMilliunits).toBe(100_000);
    expect(summary.onBudgetAccountCount).toBe(2);
    expect(summary.activeAccounts).toHaveLength(2);
    expect(summary.positiveAccounts).toHaveLength(1);
    expect(summary.negativeAccounts).toHaveLength(1);
  });

  it("separates overspent and underfunded visible categories only", () => {
    // DEFECT: hidden or deleted categories can distort overspending and underfunding counts in health summaries.
    const summary = buildVisibleCategoryHealthSummary([
      {
        id: "category-1",
        name: "Rent",
        balance: 100_000,
        hidden: false,
        deleted: false,
        goalUnderFunded: 0,
      },
      {
        id: "category-2",
        name: "Dining",
        balance: -5_000,
        hidden: false,
        deleted: false,
        goalUnderFunded: 2_000,
      },
      {
        id: "category-3",
        name: "Hidden",
        balance: -99_000,
        hidden: true,
        deleted: false,
        goalUnderFunded: 99_000,
      },
    ]);

    expect(summary.availableTotalMilliunits).toBe(100_000);
    expect(summary.overspentCategories.map((category) => category.id)).toEqual([
      "category-2",
    ]);
    expect(
      summary.underfundedCategories.map((category) => category.id),
    ).toEqual(["category-2"]);
  });

  it("converts assigned and spent milliunits into compact display summaries", () => {
    // DEFECT: assigned-vs-spent helper math can regress and report the wrong user-visible budget deltas.
    expect(toSpentMilliunits(-12_500)).toBe(12_500);
    expect(toSpentMilliunits(4_000)).toBe(0);
    expect(buildAssignedSpentSummary(50_000, 12_500)).toEqual({
      assigned: "50.00",
      spent: "12.50",
      assigned_vs_spent: "37.50",
    });
  });

  it("requires month in the spending-anomalies tool schema", () => {
    // DEFECT: the spending-anomalies tool can lose its required anchor month and run against an undefined time window.
    const ynabClient = {
      getAccount: async () => ({ id: "account-1" }),
      getCategory: async () => ({
        id: "category-1",
        hidden: false,
        name: "Category",
      }),
      getMonthCategory: async () => ({
        id: "category-1",
        hidden: false,
        name: "Category",
      }),
      getPayee: async () => ({ id: "payee-1", name: "Payee" }),
      getPayeeLocation: async () => ({ id: "location-1" }),
      getPayeeLocationsByPayee: async () => [],
      getPlan: async () => ({ id: "plan-1", name: "Plan" }),
      getPlanMonth: async () => ({ month: "2026-04-01" }),
      getPlanSettings: async () => ({}),
      getScheduledTransaction: async () => ({
        amount: 0,
        dateFirst: "2026-04-01",
        id: "sched-1",
      }),
      getTransaction: async () => ({
        amount: 0,
        date: "2026-04-01",
        id: "txn-1",
      }),
      getUser: async () => ({ id: "user-1", name: "User" }),
      listAccounts: async () => [],
      listCategories: async () => [],
      listPayeeLocations: async () => [],
      listPayees: async () => [],
      listPlanMonths: async () => [],
      listPlans: async () => ({ defaultPlan: null, plans: [] }),
      listScheduledTransactions: async () => [],
      listTransactions: async () => [],
    };
    const definitions = getFinancialHealthToolDefinitions(ynabClient as never);
    const anomaliesTool = definitions.find(
      (definition) => definition.name === "ynab_get_spending_anomalies",
    );

    expect(anomaliesTool).toBeDefined();
    expect(() =>
      z.object(anomaliesTool?.inputSchema ?? {}).parse({}),
    ).toThrow();
    expect(() =>
      z.object(anomaliesTool?.inputSchema ?? {}).parse({
        month: "2026-04-01",
      }),
    ).not.toThrow();
  });
});
