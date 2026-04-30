import { describe, expect, it } from "vitest";

import { getRegisteredToolDefinitions } from "../app/tool-definitions.js";
import type { AppEnv } from "../shared/env.js";
import { buildDiscoveryDocument, DISCOVERY_TOOL_NAMES } from "./discovery.js";

const EXPECTED_PUBLIC_TOOL_NAMES = [
  "ynab_list_plans",
  "ynab_list_accounts",
  "ynab_get_account",
  "ynab_list_categories",
  "ynab_get_category",
  "ynab_list_months",
  "ynab_get_month",
  "ynab_list_payees",
  "ynab_search_transactions",
  "ynab_get_transaction",
  "ynab_search_scheduled_transactions",
  "ynab_get_scheduled_transaction",
  "ynab_search_money_movements",
  "ynab_get_monthly_review",
  "ynab_get_financial_snapshot",
  "ynab_get_financial_health_check",
  "ynab_get_budget_health_summary",
  "ynab_get_budget_cleanup_summary",
  "ynab_get_cash_flow_summary",
  "ynab_get_spending_summary",
  "ynab_get_spending_anomalies",
  "ynab_get_category_trend_summary",
  "ynab_get_upcoming_obligations",
  "ynab_get_income_summary",
  "ynab_get_recurring_expense_summary",
  "ynab_get_cash_resilience_summary",
  "ynab_get_net_worth_trajectory",
] as const;

const REMOVED_TOOL_NAMES = [
  "ynab_get_mcp_version",
  "ynab_get_user",
  "ynab_get_plan",
  "ynab_get_plan_settings",
  "ynab_get_payee",
  "ynab_explain_month_delta",
  "ynab_get_budget_change_digest",
  "ynab_list_payee_locations",
  "ynab_get_payee_location",
  "ynab_get_payee_locations_by_payee",
  "ynab_list_transactions",
  "ynab_get_transactions_by_month",
  "ynab_get_transactions_by_account",
  "ynab_get_transactions_by_category",
  "ynab_get_transactions_by_payee",
  "ynab_list_scheduled_transactions",
  "ynab_get_money_movements",
  "ynab_get_money_movements_by_month",
  "ynab_get_money_movement_groups",
  "ynab_get_money_movement_groups_by_month",
  "ynab_get_month_category",
  "ynab_list_plan_months",
  "ynab_get_plan_month",
  "ynab_get_cash_runway",
  "ynab_get_emergency_fund_coverage",
  "ynab_get_goal_progress_summary",
  "ynab_get_debt_summary",
] as const;

class FakeD1Database {
  prepare() {
    throw new Error("Tool surface tests should not query D1.");
  }
}

function createD1Env(): AppEnv {
  return {
    mcpServerName: "ynab-mcp-build",
    mcpServerVersion: "0.1.0",
    oauthEnabled: false,
    ynabApiBaseUrl: "https://api.ynab.com/v1",
    ynabDatabase: new FakeD1Database() as unknown as D1Database,
    ynabDefaultPlanId: "plan-1",
    ynabReadSource: "d1",
    ynabStaleAfterMinutes: 360,
  };
}

function registeredToolNames() {
  return getRegisteredToolDefinitions(createD1Env(), {}).map(
    (definition) => definition.name,
  );
}

describe("public MCP tool surface", () => {
  it("publishes the rebuilt tool inventory in discovery", () => {
    const document = buildDiscoveryDocument(createD1Env());

    expect(DISCOVERY_TOOL_NAMES).toEqual(EXPECTED_PUBLIC_TOOL_NAMES);
    expect(document.tools.count).toBe(27);
    expect(document.tools.names).toEqual(EXPECTED_PUBLIC_TOOL_NAMES);
    expect(document.name).toBe("ynab-mcp-build");
    expect(document.version).toBe("0.1.0");
  });

  it("registers exactly the rebuilt public tools", () => {
    const registeredNames = registeredToolNames();

    expect([...registeredNames].sort()).toEqual(
      [...EXPECTED_PUBLIC_TOOL_NAMES].sort(),
    );
  });

  it("does not expose removed legacy or non-financial tools", () => {
    const registeredNames = registeredToolNames();

    for (const removedName of REMOVED_TOOL_NAMES) {
      expect(DISCOVERY_TOOL_NAMES).not.toContain(removedName);
      expect(registeredNames).not.toContain(removedName);
    }
  });

  it("uses standardized exposed input names", () => {
    const definitions = getRegisteredToolDefinitions(createD1Env(), {});
    const forbiddenInputNames = new Set(["latestMonth", "asOfMonth"]);

    for (const definition of definitions) {
      for (const inputName of Object.keys(definition.inputSchema)) {
        expect(forbiddenInputNames.has(inputName)).toBe(false);
      }
    }
  });
});
