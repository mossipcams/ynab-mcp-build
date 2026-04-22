import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AppDependencies } from "../app/dependencies.js";
import { resolveYnabClient } from "../app/dependencies.js";
import type { AppEnv } from "../shared/env.js";
import { registerAccountsSlice } from "../slices/accounts/index.js";
import { registerFinancialHealthSlice } from "../slices/financial-health/index.js";
import { registerMetaSlice } from "../slices/meta/index.js";
import { registerMoneyMovementsSlice } from "../slices/money-movements/index.js";
import { registerPayeesSlice } from "../slices/payees/index.js";
import { registerPlansSlice } from "../slices/plans/index.js";
import { registerTransactionsSlice } from "../slices/transactions/index.js";

export function registerSlices(server: McpServer, env: AppEnv, dependencies: AppDependencies) {
  const ynabClient = resolveYnabClient(env, dependencies);

  registerMetaSlice(server, env, ynabClient);
  registerPlansSlice(server, ynabClient);
  registerAccountsSlice(server, ynabClient);
  registerTransactionsSlice(server, ynabClient);
  registerPayeesSlice(server, ynabClient);
  registerMoneyMovementsSlice(server, ynabClient);
  registerFinancialHealthSlice(server, ynabClient);
}
