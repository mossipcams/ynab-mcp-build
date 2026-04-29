import {
  defineTool,
  type SliceToolDefinition,
} from "../../shared/tool-definition.js";
import {
  fieldProjectionSchema,
  includeIdsSchema,
  paginationSchema,
  planIdSchema,
  requiredIdSchema,
} from "../../shared/tool-inputs.js";
import {
  getDbScheduledTransaction,
  listDbScheduledTransactions,
} from "./service.js";

const scheduledTransactionFields = [
  "date_first",
  "date_next",
  "amount",
  "payee_name",
  "category_name",
  "account_name",
] as const;

export type DbScheduledTransactionToolDependencies = Parameters<
  typeof listDbScheduledTransactions
>[0];

export function getDbScheduledTransactionToolDefinitions(
  dependencies: DbScheduledTransactionToolDependencies,
): SliceToolDefinition[] {
  return [
    defineTool({
      name: "ynab_list_scheduled_transactions",
      title: "List YNAB Scheduled Transactions",
      description:
        "Lists scheduled transactions from the D1 read model with optional pagination and compact field projection.",
      inputSchema: {
        ...planIdSchema,
        ...paginationSchema,
        fields: fieldProjectionSchema(scheduledTransactionFields),
        ...includeIdsSchema,
      },
      execute: async (input) =>
        listDbScheduledTransactions(dependencies, input),
    }),
    defineTool({
      name: "ynab_get_scheduled_transaction",
      title: "Get YNAB Scheduled Transaction",
      description:
        "Returns a compact summary for a single scheduled transaction from the D1 read model.",
      inputSchema: {
        ...planIdSchema,
        scheduledTransactionId: requiredIdSchema,
      },
      execute: async (input) => getDbScheduledTransaction(dependencies, input),
    }),
  ];
}
