import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AppDependencies } from "../app/dependencies.js";
import { resolveYnabClient } from "../app/dependencies.js";
import type { AppEnv } from "../shared/env.js";
import { getAccountsSliceToolDefinitions } from "../slices/accounts/index.js";
import { getFinancialHealthSliceToolDefinitions } from "../slices/financial-health/index.js";
import { getMetaSliceToolDefinitions } from "../slices/meta/index.js";
import { getMoneyMovementsSliceToolDefinitions } from "../slices/money-movements/index.js";
import { getPayeesSliceToolDefinitions } from "../slices/payees/index.js";
import { getPlansSliceToolDefinitions } from "../slices/plans/index.js";
import { getTransactionsSliceToolDefinitions } from "../slices/transactions/index.js";
import { registerMcpToolDefinitions } from "./tools.js";

export function registerSlices(server: McpServer, env: AppEnv, dependencies: AppDependencies) {
  const ynabClient = resolveYnabClient(env, dependencies);
  const definitions = [
    ...getMetaSliceToolDefinitions(
      {
        name: env.mcpServerName,
        version: env.mcpServerVersion
      },
      ynabClient
    ),
    ...getPlansSliceToolDefinitions(ynabClient),
    ...getAccountsSliceToolDefinitions(ynabClient),
    ...getTransactionsSliceToolDefinitions(ynabClient),
    ...getPayeesSliceToolDefinitions(ynabClient),
    ...getMoneyMovementsSliceToolDefinitions(ynabClient),
    ...getFinancialHealthSliceToolDefinitions(ynabClient)
  ];

  registerMcpToolDefinitions(server, definitions);
}
