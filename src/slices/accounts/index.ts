import type { YnabClient } from "../../platform/ynab/client.js";
import { getAccountToolDefinitions } from "./tools.js";

export function getAccountsSliceToolDefinitions(ynabClient: YnabClient) {
  return getAccountToolDefinitions(ynabClient);
}
