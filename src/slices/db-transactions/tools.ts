import { z } from "zod";

import type { SliceToolDefinition } from "../../shared/tool-definition.js";
import { searchTransactions } from "./service.js";

export type DbTransactionToolDependencies = Parameters<typeof searchTransactions>[0];

export function getDbTransactionToolDefinitions(
  dependencies: DbTransactionToolDependencies
): SliceToolDefinition[] {
  return [
    {
      name: "ynab_search_transactions",
      title: "Search YNAB Transactions",
      description: "Searches synced YNAB transactions from the D1 read model with freshness metadata.",
      inputSchema: {
        planId: z.string().optional(),
        fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        payeeId: z.string().optional(),
        accountId: z.string().optional(),
        categoryId: z.string().optional(),
        minAmount: z.number().optional(),
        maxAmount: z.number().optional(),
        includeDeleted: z.boolean().optional(),
        limit: z.number().int().min(1).max(500).optional()
      },
      execute: async (input) => searchTransactions(dependencies, input)
    }
  ];
}
