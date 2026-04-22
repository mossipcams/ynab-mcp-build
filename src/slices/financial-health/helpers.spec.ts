import { describe, expect, it } from "vitest";

import {
  buildAccountSnapshotSummary,
  buildAssignedSpentSummary,
  buildVisibleCategoryHealthSummary,
  formatMilliunits,
  toSpentMilliunits
} from "./helpers.js";

describe("financial health helpers", () => {
  it("builds assigned-versus-spent totals from month activity", () => {
    expect(buildAssignedSpentSummary(250000, toSpentMilliunits(-175000))).toEqual({
      assigned: "250.00",
      spent: "175.00",
      assigned_vs_spent: "75.00"
    });
  });

  it("summarizes active account balances into cash, debt, and net worth", () => {
    const summary = buildAccountSnapshotSummary([
      {
        id: "checking",
        name: "Checking",
        balance: 325000,
        deleted: false,
        closed: false,
        onBudget: true,
        type: "checking"
      },
      {
        id: "savings",
        name: "Savings",
        balance: 1800000,
        deleted: false,
        closed: false,
        onBudget: true,
        type: "savings"
      },
      {
        id: "visa",
        name: "Visa",
        balance: -250000,
        deleted: false,
        closed: false,
        onBudget: true,
        type: "creditCard"
      },
      {
        id: "old",
        name: "Old Checking",
        balance: 0,
        deleted: false,
        closed: true,
        onBudget: true,
        type: "checking"
      }
    ]);

    expect(summary.activeAccounts).toHaveLength(3);
    expect(formatMilliunits(summary.netWorthMilliunits)).toBe("1875.00");
    expect(formatMilliunits(summary.liquidCashMilliunits)).toBe("2125.00");
    expect(summary.onBudgetAccountCount).toBe(3);
    expect(summary.positiveAccounts.map((account) => account.name)).toEqual(["Checking", "Savings"]);
    expect(summary.negativeAccounts.map((account) => account.name)).toEqual(["Visa"]);
  });

  it("summarizes visible overspent and underfunded categories", () => {
    const summary = buildVisibleCategoryHealthSummary([
      {
        id: "rent",
        name: "Rent",
        balance: 400000,
        hidden: false,
        deleted: false,
        goalUnderFunded: 0
      },
      {
        id: "groceries",
        name: "Groceries",
        balance: -35000,
        hidden: false,
        deleted: false,
        goalUnderFunded: 5000
      },
      {
        id: "vacation",
        name: "Vacation",
        balance: 0,
        hidden: false,
        deleted: false,
        goalUnderFunded: 45000
      },
      {
        id: "hidden",
        name: "Hidden",
        balance: -5000,
        hidden: true,
        deleted: false,
        goalUnderFunded: 1000
      }
    ]);

    expect(formatMilliunits(summary.availableTotalMilliunits)).toBe("400.00");
    expect(summary.overspentCategories.map((category) => category.name)).toEqual(["Groceries"]);
    expect(summary.underfundedCategories.map((category) => category.name)).toEqual(["Groceries", "Vacation"]);
  });
});
