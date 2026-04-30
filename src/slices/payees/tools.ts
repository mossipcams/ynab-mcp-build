import type { YnabClient } from "../../platform/ynab/client.js";
import {
  defineTool,
  type SliceToolDefinition,
} from "../../shared/tool-definition.js";
import { paginatedProjectionSchema } from "../../shared/tool-inputs.js";
import { listPayees } from "./service.js";

const payeeFields = ["name", "transfer_account_id"] as const;

export function getPayeeToolDefinitions(
  ynabClient: YnabClient,
): SliceToolDefinition[] {
  return [
    defineTool({
      name: "ynab_list_payees",
      title: "List YNAB Payees",
      description:
        "Lists YNAB payees with optional pagination and compact field projection.",
      inputSchema: paginatedProjectionSchema(payeeFields),
      execute: async (input) => listPayees(ynabClient, input),
    }),
  ];
}
