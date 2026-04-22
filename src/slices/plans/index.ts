import type { YnabClient } from "../../platform/ynab/client.js";
import { getPlanToolDefinitions } from "./tools.js";

export function getPlansSliceToolDefinitions(ynabClient: YnabClient) {
  return getPlanToolDefinitions(ynabClient);
}
