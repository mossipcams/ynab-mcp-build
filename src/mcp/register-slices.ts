import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { AppDependencies } from "../app/dependencies.js";
import { resolveYnabClient } from "../app/dependencies.js";
import { createYnabReadModelClient } from "../platform/ynab/read-model/client.js";
import { createReadModelFreshness } from "../platform/ynab/read-model/freshness.js";
import { createInitialPopulationRepository } from "../platform/ynab/read-model/initial-population-repository.js";
import { createInitialPopulationService } from "../platform/ynab/read-model/initial-population-service.js";
import { createMoneyMovementsRepository } from "../platform/ynab/read-model/money-movements-repository.js";
import { createScheduledTransactionsRepository } from "../platform/ynab/read-model/scheduled-transactions-repository.js";
import { createTransactionsRepository } from "../platform/ynab/read-model/transactions-repository.js";
import type { AppEnv } from "../shared/env.js";
import type { SliceToolDefinition } from "../shared/tool-definition.js";
import { getAccountToolDefinitions } from "../slices/accounts/index.js";
import { getDbMoneyMovementToolDefinitions } from "../slices/db-money-movements/index.js";
import { getDbScheduledTransactionToolDefinitions } from "../slices/db-scheduled-transactions/index.js";
import { getFinancialHealthToolDefinitions } from "../slices/financial-health/index.js";
import { getMetaToolDefinitions } from "../slices/meta/index.js";
import { getMoneyMovementToolDefinitions } from "../slices/money-movements/index.js";
import { getPayeeToolDefinitions } from "../slices/payees/index.js";
import { getPlanToolDefinitions } from "../slices/plans/index.js";
import { getTransactionToolDefinitions } from "../slices/transactions/index.js";
import { registerToolDefinitions } from "./tool-registry.js";

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
  const transactionsRepository = createTransactionsRepository(env.ynabDatabase);
  const ynabClient = createYnabReadModelClient(env.ynabDatabase, {
    defaultPlanId: env.ynabDefaultPlanId
  });
  const definitions: SliceToolDefinition[] = [
    {
      name: "ynab_get_mcp_version",
      title: "YNAB MCP Version",
      description: "Returns the MCP server name and version for this deployment.",
      inputSchema: {},
      execute: () => ({
        name: env.mcpServerName,
        version: env.mcpServerVersion
      })
    },
    ...getMetaToolDefinitions(env, ynabClient).filter((definition) => definition.name !== "ynab_get_mcp_version"),
    ...getPlanToolDefinitions(ynabClient),
    ...getAccountToolDefinitions(ynabClient),
    ...getTransactionToolDefinitions(ynabClient).filter((definition) => !definition.name.includes("scheduled")),
    ...getDbScheduledTransactionToolDefinitions({
      defaultPlanId: env.ynabDefaultPlanId,
      scheduledTransactionsRepository: createScheduledTransactionsRepository(env.ynabDatabase)
    }),
    ...getPayeeToolDefinitions(ynabClient),
    ...getDbMoneyMovementToolDefinitions({
      defaultPlanId: env.ynabDefaultPlanId,
      moneyMovementsRepository: createMoneyMovementsRepository(env.ynabDatabase)
    }),
    ...getFinancialHealthToolDefinitions(ynabClient)
  ];

  if (env.ynabTempPopulationToolEnabled && (env.ynabAccessToken || dependencies.ynabClient)) {
    const populationService = dependencies.initialPopulationService ?? createInitialPopulationService({
      defaultPlanId: env.ynabDefaultPlanId,
      initialPopulationRepository: createInitialPopulationRepository(env.ynabDatabase),
      maxRequests: env.ynabPopulateMaxRequestsPerRun,
      now,
      transactionsRepository,
      ynabClient: resolveYnabClient(env, dependencies)
    });

    definitions.push({
      name: "ynab_admin_populate_d1",
      title: "Populate YNAB D1 Read Model",
      description: "Temporary admin tool that populates the D1 YNAB read model from bounded YNAB API reads.",
      inputSchema: {
        confirm: z.boolean().optional(),
        dryRun: z.boolean().optional(),
        includeAllPlans: z.boolean().optional(),
        maxRequests: z.number().int().min(1).max(200).optional(),
        planId: z.string().optional()
      },
      execute: (input) => populationService.populate(input)
    });
  }

  return definitions.map((definition) => withReadModelFreshness(definition, {
    defaultPlanId: env.ynabDefaultPlanId,
    freshness
  }));
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
  if (
    name === "ynab_admin_populate_d1"
    || name === "ynab_get_mcp_version"
    || name === "ynab_get_user"
    || name === "ynab_list_plans"
  ) {
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

export function registerSlices(server: McpServer, env: AppEnv, dependencies: AppDependencies) {
  registerToolDefinitions(server, getRegisteredToolDefinitions(env, dependencies));
}
