import { z } from "zod";

import type { SliceToolDefinition } from "../../shared/tool-definition.js";
import {
  dateFieldSchema,
  fieldProjectionSchema,
  includeIdsSchema,
  paginationSchema,
  planIdSchema
} from "../../shared/tool-inputs.js";
import { searchTransactions } from "./service.js";

export type DbTransactionToolDependencies = Parameters<typeof searchTransactions>[0];

const transactionFields = ["date", "amount", "payee_name", "category_name", "account_name", "approved", "cleared"] as const;
const sortableValues = ["date_asc", "date_desc", "amount_asc", "amount_desc"] as const;

export function getDbTransactionToolDefinitions(
  dependencies: DbTransactionToolDependencies
): SliceToolDefinition[] {
  return [
    {
      name: "ynab_search_transactions",
      title: "Search YNAB Transactions",
      description: "Searches synced YNAB transactions from the D1 read model with freshness metadata.",
      inputSchema: {
        ...planIdSchema,
        fromDate: dateFieldSchema.optional(),
        toDate: dateFieldSchema.optional(),
        payeeId: z.string().optional(),
        accountId: z.string().optional(),
        categoryId: z.string().optional(),
        approved: z.boolean().optional(),
        cleared: z.string().optional(),
        minAmount: z.number().optional(),
        maxAmount: z.number().optional(),
        includeTransfers: z.boolean().optional(),
        includeSummary: z.boolean().optional(),
        includeDeleted: z.boolean().optional(),
        ...paginationSchema,
        fields: fieldProjectionSchema(transactionFields),
        ...includeIdsSchema,
        sort: z.enum(sortableValues).optional()
      },
      execute: async (input) => searchTransactions(dependencies, input)
    }
  ];
}
