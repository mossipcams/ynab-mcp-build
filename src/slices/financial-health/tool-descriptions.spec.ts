import { describe, expect, it, vi } from "vitest";

import { getFinancialHealthToolDefinitions } from "./tools.js";

describe("financial health tool descriptions", () => {
  it("steers broad budget questions toward summary tools", () => {
    const definitions = getFinancialHealthToolDefinitions({
      listPlans: vi.fn(),
    } as never);

    expect(
      definitions.find(
        (definition) => definition.name === "ynab_get_monthly_review",
      )?.description,
    ).toContain("broad budget");
    expect(
      definitions.find(
        (definition) => definition.name === "ynab_get_spending_summary",
      )?.description,
    ).toContain("broad budget");
  });

  it("documents the topN cap on capped summary tools", () => {
    // DEFECT: callers can only discover the topN limit after a validation error.
    const definitions = getFinancialHealthToolDefinitions({
      listPlans: vi.fn(),
    } as never);

    expect(
      definitions.find(
        (definition) => definition.name === "ynab_get_upcoming_obligations",
      )?.description,
    ).toContain("topN is capped at 10");
  });

  it("documents default statistical diagnostics on analytical tools", () => {
    const definitions = getFinancialHealthToolDefinitions({
      listPlans: vi.fn(),
    } as never);

    expect(
      definitions.find(
        (definition) => definition.name === "ynab_get_spending_anomalies",
      )?.description,
    ).toContain("z-scores");
    expect(
      definitions.find(
        (definition) => definition.name === "ynab_get_category_trend_summary",
      )?.description,
    ).toContain("regression slope");
    expect(
      definitions.find(
        (definition) => definition.name === "ynab_get_category_trend_summary",
      )?.description,
    ).toContain("correlation");
  });
});
