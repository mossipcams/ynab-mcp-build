import type { YnabClient } from "../../platform/ynab/client.js";
import {
  defineTool,
  type SliceToolDefinition,
} from "../../shared/tool-definition.js";
import { planIdSchema, requiredIdSchema } from "../../shared/tool-inputs.js";
import { getTransaction } from "./service.js";

export function getTransactionToolDefinitions(
  ynabClient: YnabClient,
): SliceToolDefinition[] {
  return [
    defineTool({
      name: "ynab_get_transaction",
      title: "Get YNAB Transaction",
      description:
        "Returns a compact summary for a single individual transaction. Use for exact transaction inspection after a drilldown.",
      inputSchema: {
        ...planIdSchema,
        transactionId: requiredIdSchema,
      },
      execute: async (input) => getTransaction(ynabClient, input),
    }),
  ];
}
