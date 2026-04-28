import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AppDependencies } from "../app/dependencies.js";
import { resolveYnabClient } from "../app/dependencies.js";
import { createReadModelFreshness } from "../platform/ynab/read-model/freshness.js";
import { createTransactionsRepository } from "../platform/ynab/read-model/transactions-repository.js";
import type { AppEnv } from "../shared/env.js";
import type { SliceToolDefinition } from "../shared/tool-definition.js";
import { getAccountToolDefinitions } from "../slices/accounts/index.js";
import { getDbTransactionToolDefinitions } from "../slices/db-transactions/index.js";
import { getFinancialHealthToolDefinitions } from "../slices/financial-health/index.js";
import { getMetaToolDefinitions } from "../slices/meta/index.js";
import { getMoneyMovementToolDefinitions } from "../slices/money-movements/index.js";
import { getPayeeToolDefinitions } from "../slices/payees/index.js";
import { getPlanToolDefinitions } from "../slices/plans/index.js";
import { getTransactionToolDefinitions } from "../slices/transactions/index.js";
import { DISCOVERY_TOOL_NAMES } from "./discovery.js";
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
  const implementedDefinitions: SliceToolDefinition[] = [
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
    ...getDbTransactionToolDefinitions({
      defaultPlanId: env.ynabDefaultPlanId,
      freshness: createReadModelFreshness(env.ynabDatabase, {
        now,
        staleAfterMinutes: env.ynabStaleAfterMinutes
      }),
      transactionsRepository: createTransactionsRepository(env.ynabDatabase)
    })
  ];
  const implementedNames = new Set(implementedDefinitions.map((definition) => definition.name));
  const unavailableDefinitions = DISCOVERY_TOOL_NAMES
    .filter((name) => !implementedNames.has(name))
    .map((name) => ({
      name,
      title: name,
      description: "This tool is reserved for the DB-backed YNAB read model rebuild and is not available yet.",
      inputSchema: {},
      execute: async () => {
        throw new Error(`${name} is not available yet in DB-backed read mode.`);
      }
    })) satisfies SliceToolDefinition[];

  return [
    ...implementedDefinitions,
    ...unavailableDefinitions
  ];
}

export function registerSlices(server: McpServer, env: AppEnv, dependencies: AppDependencies) {
  registerToolDefinitions(server, getRegisteredToolDefinitions(env, dependencies));
}
