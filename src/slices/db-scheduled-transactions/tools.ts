import {
  defineTool,
  type SliceToolDefinition,
} from "../../shared/tool-definition.js";
import {
  dateFieldSchema,
  fieldProjectionSchema,
  includeIdsSchema,
  paginationSchema,
  planIdSchema,
  requiredIdSchema,
} from "../../shared/tool-inputs.js";
import {
  getDbScheduledTransaction,
  searchDbScheduledTransactions,
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
  typeof searchDbScheduledTransactions
>[0];

export function getDbScheduledTransactionToolDefinitions(
  dependencies: DbScheduledTransactionToolDependencies,
): SliceToolDefinition[] {
  return [
    defineTool({
      name: "ynab_search_scheduled_transactions",
      title: "Search YNAB Scheduled Transactions",
      description:
        "Searches scheduled transactions from the D1 read model with filters, pagination, and compact projection.",
      inputSchema: {
        ...planIdSchema,
        fromDate: dateFieldSchema.optional(),
        toDate: dateFieldSchema.optional(),
        accountId: requiredIdSchema.optional(),
        categoryId: requiredIdSchema.optional(),
        payeeId: requiredIdSchema.optional(),
        ...paginationSchema,
        fields: fieldProjectionSchema(scheduledTransactionFields),
        ...includeIdsSchema,
      },
      execute: async (input) =>
        searchDbScheduledTransactions(dependencies, input),
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
