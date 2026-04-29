import type { AppDependencies } from "./dependencies.js";
import { resolveYnabClient } from "./dependencies.js";
import { createYnabReadModelClient } from "../platform/ynab/read-model/client.js";
import { createReadModelFreshness } from "../platform/ynab/read-model/freshness.js";
import { createMoneyMovementsRepository } from "../platform/ynab/read-model/money-movements-repository.js";
import { createScheduledTransactionsRepository } from "../platform/ynab/read-model/scheduled-transactions-repository.js";
import { createTransactionsRepository } from "../platform/ynab/read-model/transactions-repository.js";
import type { AppEnv } from "../shared/env.js";
import { defineTool, type SliceToolDefinition } from "../shared/tool-definition.js";
import { getAccountToolDefinitions } from "../slices/accounts/index.js";
import { getDbMoneyMovementToolDefinitions } from "../slices/db-money-movements/index.js";
import { getDbScheduledTransactionToolDefinitions } from "../slices/db-scheduled-transactions/index.js";
import { getDbTransactionToolDefinitions } from "../slices/db-transactions/index.js";
import { getFinancialHealthToolDefinitions } from "../slices/financial-health/index.js";
import { getMetaToolDefinitions } from "../slices/meta/index.js";
import { getMoneyMovementToolDefinitions } from "../slices/money-movements/index.js";
import { getPayeeToolDefinitions } from "../slices/payees/index.js";
import { getPlanToolDefinitions } from "../slices/plans/index.js";
import { getTransactionToolDefinitions } from "../slices/transactions/index.js";

const DEFINITIONS_WITH_OWN_FRESHNESS = new Set([
  "ynab_search_transactions"
]);

const REQUIRED_ENDPOINTS_BY_TOOL = {
  ynab_get_budget_cleanup_summary: ["categories", "months", "transactions"],
  ynab_get_budget_health_summary: ["categories", "months"],
  ynab_get_cash_flow_summary: ["months", "transactions"],
  ynab_get_cash_runway: ["accounts", "months", "scheduled_transactions"],
  ynab_get_category_trend_summary: ["categories", "months"],
  ynab_get_debt_summary: ["accounts"],
  ynab_get_emergency_fund_coverage: ["accounts", "months", "scheduled_transactions"],
  ynab_get_financial_health_check: ["accounts", "categories", "months", "transactions"],
  ynab_get_financial_snapshot: ["accounts", "categories", "months"],
  ynab_get_goal_progress_summary: ["categories", "months"],
  ynab_get_income_summary: ["months", "transactions"],
  ynab_get_monthly_review: ["categories", "months", "transactions"],
  ynab_get_net_worth_trajectory: ["accounts", "months", "transactions"],
  ynab_get_recurring_expense_summary: ["transactions"],
  ynab_get_spending_anomalies: ["categories", "months"],
  ynab_get_spending_summary: ["categories", "months", "transactions"],
  ynab_get_upcoming_obligations: ["scheduled_transactions"]
} satisfies Record<string, readonly string[]>;

export function getRegisteredToolDefinitions(env: AppEnv, dependencies: AppDependencies) {
  if (env.ynabReadSource === "d1") {
    return getDbBackedToolDefinitions(env, dependencies);
  }

  const ynabClient = resolveYnabClient(env, dependencies);

  return [
    ...getMetaToolDefinitions(env, ynabClient),
    ...getPlanToolDefinitions(ynabClient),
    ...getAccountToolDefinitions(ynabClient),
    ...getTransactionToolDefinitions(ynabClient),
    ...getPayeeToolDefinitions(ynabClient),
    ...getMoneyMovementToolDefinitions(ynabClient),
    ...getFinancialHealthToolDefinitions(ynabClient)
  ];
}

function getDbBackedToolDefinitions(env: AppEnv, dependencies: AppDependencies) {
  if (!env.ynabDatabase) {
    throw new Error("YNAB_DB is required when YNAB_READ_SOURCE=d1.");
  }

  const now = () => new Date(dependencies.now?.() ?? Date.now()).toISOString();
  const freshness = createReadModelFreshness(env.ynabDatabase, {
    now,
    staleAfterMinutes: env.ynabStaleAfterMinutes
  });
  const defaultPlanDependencies = env.ynabDefaultPlanId
    ? { defaultPlanId: env.ynabDefaultPlanId }
    : {};
  const ynabClient = createYnabReadModelClient(env.ynabDatabase, defaultPlanDependencies);
  const baseDependencies = defaultPlanDependencies;
  const definitions: SliceToolDefinition[] = [
    defineTool({
      name: "ynab_get_mcp_version",
      title: "YNAB MCP Version",
      description: "Returns the MCP server name and version for this deployment.",
      inputSchema: {},
      execute: () => Promise.resolve({
        name: env.mcpServerName,
        version: env.mcpServerVersion
      })
    }),
    ...getMetaToolDefinitions(env, ynabClient).filter((definition) => definition.name !== "ynab_get_mcp_version"),
    ...getPlanToolDefinitions(ynabClient),
    ...getAccountToolDefinitions(ynabClient),
    ...getTransactionToolDefinitions(ynabClient).filter(
      (definition) => !definition.name.includes("scheduled") && definition.name !== "ynab_search_transactions"
    ),
    ...getDbTransactionToolDefinitions({
      ...baseDependencies,
      freshness,
      transactionsRepository: createTransactionsRepository(env.ynabDatabase)
    }),
    ...getDbScheduledTransactionToolDefinitions({
      ...baseDependencies,
      scheduledTransactionsRepository: createScheduledTransactionsRepository(env.ynabDatabase)
    }),
    ...getPayeeToolDefinitions(ynabClient),
    ...getDbMoneyMovementToolDefinitions({
      ...baseDependencies,
      moneyMovementsRepository: createMoneyMovementsRepository(env.ynabDatabase)
    }),
    ...getFinancialHealthToolDefinitions(ynabClient)
  ];

  return definitions.map((definition) =>
    DEFINITIONS_WITH_OWN_FRESHNESS.has(definition.name)
      ? definition
      : withReadModelFreshness(definition, {
          ...baseDependencies,
          freshness
        })
  );
}

type FreshnessDependencies = {
  defaultPlanId?: string;
  freshness: {
    getFreshness(planId: string, requiredEndpoints: readonly string[]): Promise<{
      health_status: string;
      last_synced_at: string | null;
      stale: boolean;
      warning: string | null;
    }>;
  };
};

function requiredEndpointsForTool(name: string) {
  const explicitEndpoints = REQUIRED_ENDPOINTS_BY_TOOL[name as keyof typeof REQUIRED_ENDPOINTS_BY_TOOL];

  if (explicitEndpoints) {
    return explicitEndpoints;
  }

  if (name === "ynab_get_mcp_version" || name === "ynab_get_user" || name === "ynab_list_plans") {
    return [];
  }

  if (name.includes("money_movement")) {
    return ["money_movements"];
  }

  if (name.includes("scheduled") || name.includes("upcoming")) {
    return ["scheduled_transactions"];
  }

  if (name.includes("transaction")) {
    return ["transactions"];
  }

  if (name.includes("account")) {
    return ["accounts"];
  }

  if (name.includes("payee")) {
    return ["payees"];
  }

  if (name.includes("category") || name.includes("month") || name.includes("goal")) {
    return ["categories", "months"];
  }

  if (name.includes("plan_settings")) {
    return ["plan_settings"];
  }

  if (name.includes("plan")) {
    return ["plans"];
  }

  return ["accounts", "categories", "months", "transactions", "scheduled_transactions"];
}

function resolveFreshnessPlanId(input: unknown, defaultPlanId: string | undefined) {
  if (input && typeof input === "object" && "planId" in input) {
    const planId = (input as { planId?: unknown }).planId;

    if (typeof planId === "string" && planId.trim().length > 0) {
      return planId;
    }
  }

  if (defaultPlanId) {
    return defaultPlanId;
  }

  throw new Error("planId is required when YNAB_DEFAULT_PLAN_ID is not configured.");
}

function isUnhealthy(freshness: { health_status: string }) {
  return freshness.health_status === "never_synced" || freshness.health_status === "unhealthy";
}

function buildReadModelSyncNextAction(planId: string, requiredEndpoints: readonly string[]) {
  return {
    code: "sync_read_model",
    message: `Run the scheduled YNAB read-model sync for ${planId}, then retry after endpoints are healthy: ${requiredEndpoints.join(", ")}.`
  };
}

function withReadModelFreshness(
  definition: SliceToolDefinition,
  dependencies: FreshnessDependencies
): SliceToolDefinition {
  const requiredEndpoints = requiredEndpointsForTool(definition.name);

  if (requiredEndpoints.length === 0) {
    return definition;
  }

  return {
    ...definition,
    execute: async (input) => {
      const planId = resolveFreshnessPlanId(input, dependencies.defaultPlanId);
      const freshness = await dependencies.freshness.getFreshness(planId, requiredEndpoints);
      const dataFreshness = {
        ...freshness,
        required_endpoints: requiredEndpoints
      };

      if (isUnhealthy(freshness)) {
        return {
          status: "unhealthy",
          data_freshness: dataFreshness,
          next_action: buildReadModelSyncNextAction(planId, requiredEndpoints),
          data: null
        };
      }

      const data = await definition.execute(input);

      return {
        status: freshness.stale ? "stale" : "ok",
        data_freshness: dataFreshness,
        data
      };
    }
  };
}
