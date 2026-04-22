import { describe, expect, it } from "vitest";

import { createApp } from "../../app/create-app.js";

const expectedToolNames = [
  "ynab_get_account",
  "ynab_get_budget_cleanup_summary",
  "ynab_get_budget_health_summary",
  "ynab_get_cash_flow_summary",
  "ynab_get_cash_runway",
  "ynab_get_category",
  "ynab_get_category_trend_summary",
  "ynab_get_debt_summary",
  "ynab_get_emergency_fund_coverage",
  "ynab_get_financial_health_check",
  "ynab_get_financial_snapshot",
  "ynab_get_goal_progress_summary",
  "ynab_get_income_summary",
  "ynab_get_mcp_version",
  "ynab_get_money_movement_groups",
  "ynab_get_money_movement_groups_by_month",
  "ynab_get_money_movements",
  "ynab_get_money_movements_by_month",
  "ynab_get_month_category",
  "ynab_get_monthly_review",
  "ynab_get_net_worth_trajectory",
  "ynab_get_payee",
  "ynab_get_payee_location",
  "ynab_get_payee_locations_by_payee",
  "ynab_get_plan",
  "ynab_get_plan_month",
  "ynab_get_plan_settings",
  "ynab_get_recurring_expense_summary",
  "ynab_get_scheduled_transaction",
  "ynab_get_spending_anomalies",
  "ynab_get_spending_summary",
  "ynab_get_transaction",
  "ynab_get_transactions_by_account",
  "ynab_get_transactions_by_category",
  "ynab_get_transactions_by_month",
  "ynab_get_transactions_by_payee",
  "ynab_get_upcoming_obligations",
  "ynab_get_user",
  "ynab_list_accounts",
  "ynab_list_categories",
  "ynab_list_payee_locations",
  "ynab_list_payees",
  "ynab_list_plan_months",
  "ynab_list_plans",
  "ynab_list_scheduled_transactions",
  "ynab_list_transactions",
  "ynab_search_transactions"
];

describe("well-known MCP route", () => {
  it("returns MCP discovery metadata", async () => {
    const app = createApp();

    const response = await app.request("http://localhost/.well-known/mcp.json");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      name: "ynab-mcp-build",
      version: "0.1.0",
      protocol: {
        transport: "streamable-http"
      },
      endpoints: {
        mcp: "/mcp",
        wellKnown: "/.well-known/mcp.json"
      },
      tools: {
        count: expectedToolNames.length,
        names: expectedToolNames
      }
    });
  });

  it("uses Worker bindings for server metadata when provided", async () => {
    const app = createApp();
    const env = {
      MCP_SERVER_NAME: "custom-server",
      MCP_SERVER_VERSION: "9.9.9",
      YNAB_API_BASE_URL: "https://api.ynab.com/v1"
    } as unknown as Env;

    const response = await app.request(
      "http://localhost/.well-known/mcp.json",
      undefined,
      env
    );

    await expect(response.json()).resolves.toMatchObject({
      name: "custom-server",
      version: "9.9.9"
    });
  });
});
