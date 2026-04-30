import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

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

  it("keeps detailLevel focused on normal versus detailed outputs", () => {
    // DEFECT: a broad or ignored verbosity flag can make clients spend tokens
    // without a predictable response-shape change.
    const definitions = getFinancialHealthToolDefinitions({
      listPlans: vi.fn(),
    } as never);
    const monthlyReview = definitions.find(
      (definition) => definition.name === "ynab_get_monthly_review",
    );

    expect(() =>
      z.object(monthlyReview?.inputSchema ?? {}).parse({
        detailLevel: "normal",
      }),
    ).not.toThrow();
    expect(() =>
      z.object(monthlyReview?.inputSchema ?? {}).parse({
        detailLevel: "detailed",
      }),
    ).not.toThrow();
    expect(() =>
      z.object(monthlyReview?.inputSchema ?? {}).parse({
        detailLevel: "brief",
      }),
    ).toThrow();
    expect(monthlyReview?.inputSchema.detailLevel?.description).toContain(
      "normal is compact",
    );
  });

  it("does not advertise detailLevel on summaries that ignore it", () => {
    // DEFECT: no-op tool inputs encourage clients to spend context budget on
    // arguments that cannot change the answer.
    const definitions = getFinancialHealthToolDefinitions({
      listPlans: vi.fn(),
    } as never);

    for (const toolName of [
      "ynab_get_cash_flow_summary",
      "ynab_get_category_trend_summary",
      "ynab_get_net_worth_trajectory",
    ]) {
      const definition = definitions.find(
        (candidate) => candidate.name === toolName,
      );

      expect(definition?.inputSchema).not.toHaveProperty("detailLevel");
    }
  });
});
