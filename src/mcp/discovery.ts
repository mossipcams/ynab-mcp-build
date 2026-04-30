import type { AppEnv } from "../shared/env.js";

export const DISCOVERY_TOOL_NAMES = [
  "ynab_explain_month_delta",
  "ynab_get_account",
  "ynab_get_budget_change_digest",
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
  "ynab_search_transactions",
] as const;

export type WellKnownDocument = {
  name: string;
  version: string;
  protocol: {
    transport: "streamable-http";
  };
  endpoints: {
    mcp: "/mcp";
    wellKnown: "/.well-known/mcp.json";
  };
  tools: {
    count: number;
    names: string[];
  };
};

export function buildDiscoveryDocument(env: AppEnv): WellKnownDocument {
  return {
    name: env.mcpServerName,
    version: env.mcpServerVersion,
    protocol: {
      transport: "streamable-http",
    },
    endpoints: {
      mcp: "/mcp",
      wellKnown: "/.well-known/mcp.json",
    },
    tools: {
      count: DISCOVERY_TOOL_NAMES.length,
      names: [...DISCOVERY_TOOL_NAMES],
    },
  };
}
