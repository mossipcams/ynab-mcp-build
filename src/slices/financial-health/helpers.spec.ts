import { describe, expect, it } from "vitest";

import {
  buildAccountSnapshotSummary,
  buildVisibleCategoryHealthSummary,
} from "./helpers.js";

describe("financial health helpers", () => {
  it("keeps off-budget positive accounts out of liquid cash", () => {
    // DEFECT: tracking accounts can inflate spendable cash when on-budget status is ignored.
    const summary = buildAccountSnapshotSummary([
      {
        id: "checking",
        name: "Checking",
        balance: 200_000,
        deleted: false,
        closed: false,
        onBudget: true,
      },
      {
        id: "ira",
        name: "Roth IRA",
        type: "otherAsset",
        balance: 500_000,
        deleted: false,
        closed: false,
        onBudget: false,
      },
      {
        id: "card",
        name: "Credit Card",
        balance: -50_000,
        deleted: false,
        closed: false,
        onBudget: true,
      },
    ]);

    expect(summary.netWorthMilliunits).toBe(650_000);
    expect(summary.liquidCashMilliunits).toBe(200_000);
    expect(summary.onBudgetAccountCount).toBe(2);
  });

  it("excludes internal YNAB categories from available budget totals", () => {
    // DEFECT: internal YNAB categories can make available_total look far larger than user-budgeted funds.
    const summary = buildVisibleCategoryHealthSummary([
      {
        id: "ready-to-assign",
        name: "Inflow: Ready to Assign",
        categoryGroupName: "Internal Master Category",
        balance: 154_301_060,
        hidden: false,
        deleted: false,
      },
      {
        id: "uncategorized",
        name: "Uncategorized",
        categoryGroupName: "Internal Master Category",
        balance: 50_000,
        hidden: false,
        deleted: false,
      },
      {
        id: "groceries",
        name: "Groceries",
        categoryGroupName: "Food",
        balance: 250_000,
        hidden: false,
        deleted: false,
      },
    ]);

    expect(summary.availableTotalMilliunits).toBe(250_000);
  });
});
