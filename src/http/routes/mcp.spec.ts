import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it } from "vitest";

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

function createTestEnv(): Env {
  return {
    MCP_SERVER_NAME: "ynab-mcp-build",
    MCP_SERVER_VERSION: "0.1.0",
    YNAB_API_BASE_URL: "https://api.ynab.com/v1"
  } as Env;
}

function createCustomEnv(): Env {
  return {
    MCP_SERVER_NAME: "custom-mcp-server",
    MCP_SERVER_VERSION: "9.9.9",
    YNAB_API_BASE_URL: "https://api.ynab.com/v1"
  } as unknown as Env;
}

describe("MCP route", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("lists registered tools over streamable HTTP", async () => {
    const app = createApp();
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        return app.fetch(request, createTestEnv());
      }
    });
    const client = new Client({
      name: "ynab-mcp-build-test-client",
      version: "1.0.0"
    });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport);

    const result = await client.listTools();

    expect(result.tools.map((tool) => tool.name).sort()).toEqual(expectedToolNames);
  });

  it("returns env-backed metadata from the version tool", async () => {
    const app = createApp();
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        return app.fetch(request, createCustomEnv());
      }
    });
    const client = new Client({
      name: "ynab-mcp-build-test-client",
      version: "1.0.0"
    });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport);

    const result = await client.callTool({
      name: "ynab_get_mcp_version",
      arguments: {}
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(textContent).toBeDefined();
    expect(textContent?.text).toBeDefined();
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      name: "custom-mcp-server",
      version: "9.9.9"
    });
  });
});
