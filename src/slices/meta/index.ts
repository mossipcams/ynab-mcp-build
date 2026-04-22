import type { YnabClient } from "../../platform/ynab/client.js";
import { getMetaToolDefinitions } from "./tools.js";

export function getMetaSliceToolDefinitions(
  metadata: {
    name: string;
    version: string;
  },
  ynabClient: YnabClient
) {
  return getMetaToolDefinitions(metadata, ynabClient);
}
