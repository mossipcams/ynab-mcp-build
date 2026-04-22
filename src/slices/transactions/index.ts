import type { YnabClient } from "../../platform/ynab/client.js";
import { getTransactionToolDefinitions } from "./tools.js";

export function getTransactionsSliceToolDefinitions(ynabClient: YnabClient) {
  return getTransactionToolDefinitions(ynabClient);
}
