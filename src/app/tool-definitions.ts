import type { AppDependencies } from "./dependencies.js";
import type { YnabClient } from "../platform/ynab/client.js";
import { createYnabReadModelClient } from "../platform/ynab/read-model/client.js";
import { createReadModelFreshness } from "../platform/ynab/read-model/freshness.js";
import { createMoneyMovementsRepository } from "../platform/ynab/read-model/money-movements-repository.js";
import { createScheduledTransactionsRepository } from "../platform/ynab/read-model/scheduled-transactions-repository.js";
import { createTransactionsRepository } from "../platform/ynab/read-model/transactions-repository.js";
import type { AppEnv } from "../shared/env.js";
import { getKnownDefaultPlan } from "../shared/plans.js";
import type { SliceToolDefinition } from "../shared/tool-definition.js";
import { getAccountToolDefinitions } from "../slices/accounts/index.js";
import { getDbMoneyMovementToolDefinitions } from "../slices/db-money-movements/index.js";
import { getDbScheduledTransactionToolDefinitions } from "../slices/db-scheduled-transactions/index.js";
import { getDbTransactionToolDefinitions } from "../slices/db-transactions/index.js";
import { getFinancialHealthToolDefinitions } from "../slices/financial-health/index.js";
import { getPayeeToolDefinitions } from "../slices/payees/index.js";
import { getPlanToolDefinitions } from "../slices/plans/index.js";
import { getTransactionToolDefinitions } from "../slices/transactions/index.js";

const DEFINITIONS_WITH_OWN_FRESHNESS = new Set(["ynab_search_transactions"]);

const REQUIRED_ENDPOINTS_BY_TOOL = {
  ynab_get_budget_cleanup_summary: ["categories", "months", "transactions"],
  ynab_get_budget_health_summary: ["categories", "months"],
  ynab_get_cash_flow_summary: ["months", "transactions"],
  ynab_get_category_trend_summary: ["categories", "months"],
  ynab_get_financial_health_check: [
    "accounts",
    "categories",
    "months",
    "transactions",
  ],
  ynab_get_financial_snapshot: ["accounts", "categories", "months"],
  ynab_get_income_summary: ["months", "transactions"],
  ynab_get_monthly_review: ["categories", "months", "transactions"],
  ynab_get_net_worth_trajectory: ["accounts", "months", "transactions"],
  ynab_get_category: ["categories"],
  ynab_get_cash_resilience_summary: [
    "accounts",
    "months",
    "scheduled_transactions",
  ],
  ynab_list_categories: ["categories"],
  ynab_list_months: ["months"],
  ynab_get_month: ["categories", "months"],
  ynab_get_recurring_expense_summary: ["transactions"],
  ynab_get_spending_anomalies: ["categories", "months"],
  ynab_get_spending_summary: ["categories", "months", "transactions"],
  ynab_get_upcoming_obligations: ["scheduled_transactions"],
} satisfies Record<string, readonly string[]>;

export function getRegisteredToolDefinitions(
  env: AppEnv,
  dependencies: AppDependencies,
) {
  if (!env.ynabDatabase) {
    throw new Error("YNAB_DB is required when YNAB_READ_SOURCE=d1.");
  }

  const now = () => new Date(dependencies.now?.() ?? Date.now()).toISOString();
  const freshness = createReadModelFreshness(env.ynabDatabase, {
    now,
    staleAfterMinutes: env.ynabStaleAfterMinutes,
  });
  const defaultPlanDependencies = env.ynabDefaultPlanId
    ? { defaultPlanId: env.ynabDefaultPlanId }
    : {};
  const ynabClient = createYnabReadModelClient(
    env.ynabDatabase,
    defaultPlanDependencies,
  );
  const baseDependencies = defaultPlanDependencies;
  const definitions: SliceToolDefinition[] = [
    ...getPlanToolDefinitions(ynabClient),
    ...getAccountToolDefinitions(ynabClient),
    ...getTransactionToolDefinitions(ynabClient).filter(
      (definition) => definition.name === "ynab_get_transaction",
    ),
    ...getDbTransactionToolDefinitions({
      ...baseDependencies,
      freshness,
      transactionsRepository: createTransactionsRepository(env.ynabDatabase),
    }),
    ...getDbScheduledTransactionToolDefinitions({
      ...baseDependencies,
      scheduledTransactionsRepository: createScheduledTransactionsRepository(
        env.ynabDatabase,
      ),
    }),
    ...getPayeeToolDefinitions(ynabClient),
    ...getDbMoneyMovementToolDefinitions({
      ...baseDependencies,
      moneyMovementsRepository: createMoneyMovementsRepository(
        env.ynabDatabase,
      ),
    }),
    ...getFinancialHealthToolDefinitions(ynabClient),
  ];

  const planIdResolver = createDefaultPlanIdResolver({
    ...(env.ynabDefaultPlanId ? { defaultPlanId: env.ynabDefaultPlanId } : {}),
    ynabClient,
  });

  return definitions
    .map((definition) =>
      DEFINITIONS_WITH_OWN_FRESHNESS.has(definition.name)
        ? definition
        : withReadModelFreshness(definition, {
            ...baseDependencies,
            freshness,
          }),
    )
    .map((definition) =>
      withAutoPopulatedPlanId(definition, { resolvePlanId: planIdResolver }),
    );
}

type FreshnessDependencies = {
  defaultPlanId?: string;
  freshness: {
    getFreshness(
      planId: string,
      requiredEndpoints: readonly string[],
    ): Promise<{
      health_status: string;
      last_synced_at: string | null;
      stale: boolean;
      warning: string | null;
    }>;
  };
};

function hasPlanIdInput(definition: SliceToolDefinition) {
  return Object.hasOwn(definition.inputSchema, "planId");
}

function getOwnProperty(input: unknown, key: string) {
  if (!input || typeof input !== "object" || !Object.hasOwn(input, key)) {
    return undefined;
  }

  const descriptor = Object.getOwnPropertyDescriptor(input, key);
  const value: unknown = descriptor?.value;

  return value;
}

function getOwnNonBlankString(input: unknown, key: string) {
  const value = getOwnProperty(input, key);

  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function getExplicitPlanId(input: unknown) {
  return getOwnNonBlankString(input, "planId");
}

function createDefaultPlanIdResolver(dependencies: {
  defaultPlanId?: string;
  ynabClient: YnabClient;
}) {
  let discoveredPlanId: Promise<string> | undefined;

  return () => {
    const configuredPlanId = dependencies.defaultPlanId?.trim();

    if (configuredPlanId) {
      return Promise.resolve(configuredPlanId);
    }

    discoveredPlanId ??= dependencies.ynabClient
      .listPlans()
      .then((plans) => {
        const defaultPlan = getKnownDefaultPlan(plans);

        if (defaultPlan) {
          return defaultPlan.id;
        }

        throw new Error(
          "planId is required when YNAB_DEFAULT_PLAN_ID is not configured.",
        );
      })
      .catch((error: unknown) => {
        discoveredPlanId = undefined;
        throw error;
      });

    return discoveredPlanId;
  };
}

function withAutoPopulatedPlanId<TInput, TOutput>(
  definition: SliceToolDefinition<TInput, TOutput>,
  dependencies: {
    resolvePlanId(): Promise<string>;
  },
): SliceToolDefinition<TInput, TOutput> {
  if (!hasPlanIdInput(definition)) {
    return definition;
  }

  return {
    ...definition,
    execute: async (input) => {
      const explicitPlanId = getExplicitPlanId(input);

      if (explicitPlanId) {
        return definition.execute(input);
      }

      const inputWithPlanId = {
        ...(input && typeof input === "object" ? input : {}),
        planId: await dependencies.resolvePlanId(),
      };

      // The wrapper can only know at runtime that this schema accepts planId.
      return definition.execute(inputWithPlanId as TInput);
    },
  };
}

function hasKnownRequiredEndpoints(
  name: string,
): name is keyof typeof REQUIRED_ENDPOINTS_BY_TOOL {
  return Object.hasOwn(REQUIRED_ENDPOINTS_BY_TOOL, name);
}

function requiredEndpointsForTool(name: string) {
  if (hasKnownRequiredEndpoints(name)) {
    return REQUIRED_ENDPOINTS_BY_TOOL[name];
  }

  if (name === "ynab_list_plans") {
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

  if (name.includes("plan_settings")) {
    return ["plan_settings"];
  }

  if (
    name.includes("category") ||
    name.includes("month") ||
    name.includes("goal")
  ) {
    return ["categories", "months"];
  }

  if (name.includes("plan")) {
    return ["plans"];
  }

  return [
    "accounts",
    "categories",
    "months",
    "transactions",
    "scheduled_transactions",
  ];
}

function hasMonthInput(input: unknown) {
  return getOwnNonBlankString(input, "month") !== undefined;
}

function requiredEndpointsForExecution(
  definition: SliceToolDefinition,
  input: unknown,
) {
  const requiredEndpoints = requiredEndpointsForTool(definition.name);

  if (
    definition.name === "ynab_get_category" &&
    hasMonthInput(input) &&
    !requiredEndpoints.includes("months")
  ) {
    return [...requiredEndpoints, "months"];
  }

  return requiredEndpoints;
}

function resolveFreshnessPlanId(
  input: unknown,
  defaultPlanId: string | undefined,
) {
  const planId = getOwnNonBlankString(input, "planId");

  if (planId) {
    return planId;
  }

  if (defaultPlanId) {
    return defaultPlanId;
  }

  throw new Error(
    "planId is required when YNAB_DEFAULT_PLAN_ID is not configured.",
  );
}

function isUnhealthy(freshness: { health_status: string }) {
  return (
    freshness.health_status === "never_synced" ||
    freshness.health_status === "unhealthy"
  );
}

function buildReadModelSyncNextAction(
  planId: string,
  requiredEndpoints: readonly string[],
) {
  return {
    code: "sync_read_model",
    message: `Run the scheduled YNAB read-model sync for ${planId}, then retry after endpoints are healthy: ${requiredEndpoints.join(", ")}.`,
  };
}

function withReadModelFreshness(
  definition: SliceToolDefinition,
  dependencies: FreshnessDependencies,
): SliceToolDefinition {
  if (requiredEndpointsForTool(definition.name).length === 0) {
    return {
      ...definition,
      execute: async (input) => ({
        status: "ok",
        data_freshness: {
          required_endpoints: [],
        },
        data: await definition.execute(input),
      }),
    };
  }

  return {
    ...definition,
    execute: async (input) => {
      const requiredEndpoints = requiredEndpointsForExecution(
        definition,
        input,
      );
      const planId = resolveFreshnessPlanId(input, dependencies.defaultPlanId);
      const freshness = await dependencies.freshness.getFreshness(
        planId,
        requiredEndpoints,
      );
      const dataFreshness = {
        ...freshness,
        required_endpoints: requiredEndpoints,
      };

      if (isUnhealthy(freshness)) {
        return {
          status: "unhealthy",
          data_freshness: dataFreshness,
          next_action: buildReadModelSyncNextAction(planId, requiredEndpoints),
          data: null,
        };
      }

      const data = await definition.execute(input);

      return {
        status: freshness.stale ? "stale" : "ok",
        data_freshness: dataFreshness,
        data,
      };
    },
  };
}
