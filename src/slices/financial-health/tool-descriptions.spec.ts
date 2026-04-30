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

  it("describes the budget change digest as an attention summary tool", () => {
    // DEFECT: digest tool can be registered with vague or misleading MCP guidance.
    const definitions = getFinancialHealthToolDefinitions({
      listPlans: vi.fn(),
    } as never);

    const digest = definitions.find(
      (definition) => definition.name === "ynab_get_budget_change_digest",
    );

    expect(digest).toBeDefined();
    expect(digest?.description).toContain("changed");
    expect(digest?.description).toContain("attention");
    expect(digest?.description).not.toContain("raw transaction");
    expect(Object.keys(digest?.inputSchema ?? {})).toEqual(
      expect.arrayContaining(["planId", "month", "detailLevel", "topN"]),
    );
  });

  it("describes month delta as an explanation tool", () => {
    // DEFECT: month delta tool can be exposed without clear MCP routing guidance.
    const definitions = getFinancialHealthToolDefinitions({
      listPlans: vi.fn(),
    } as never);

    const delta = definitions.find(
      (definition) => definition.name === "ynab_explain_month_delta",
    );

    expect(delta).toBeDefined();
    expect(delta?.description).toContain("Explains");
    expect(delta?.description).toContain("changed");
    expect(Object.keys(delta?.inputSchema ?? {})).toEqual(
      expect.arrayContaining([
        "planId",
        "baselineMonth",
        "comparisonMonth",
        "detailLevel",
        "topN",
      ]),
    );
  });
});
