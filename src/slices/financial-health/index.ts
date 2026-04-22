import type { YnabClient } from "../../platform/ynab/client.js";
import { getFinancialHealthToolDefinitions } from "./tools.js";

export function getFinancialHealthSliceToolDefinitions(ynabClient: YnabClient) {
  return getFinancialHealthToolDefinitions(ynabClient);
}
