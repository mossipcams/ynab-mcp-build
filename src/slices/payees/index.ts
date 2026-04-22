import type { YnabClient } from "../../platform/ynab/client.js";
import { getPayeeToolDefinitions } from "./tools.js";

export function getPayeesSliceToolDefinitions(ynabClient: YnabClient) {
  return getPayeeToolDefinitions(ynabClient);
}
