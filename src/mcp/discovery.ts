import type { AppEnv } from "../shared/env.js";

export const DISCOVERY_TOOL_NAMES = [
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
