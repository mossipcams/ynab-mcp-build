import type { YnabClient } from "../../platform/ynab/client.js";
import { getMoneyMovementToolDefinitions } from "./tools.js";

export function getMoneyMovementsSliceToolDefinitions(ynabClient: YnabClient) {
  return getMoneyMovementToolDefinitions(ynabClient);
}
