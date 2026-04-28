import { z } from "zod";

import type { SliceToolDefinition } from "../../shared/tool-definition.js";
import {
  getDbScheduledTransaction,
  listDbScheduledTransactions
} from "./service.js";

const scheduledTransactionFields = [
  "date_first",
  "date_next",
  "amount",
  "payee_name",
  "category_name",
  "account_name"
] as const;

export type DbScheduledTransactionToolDependencies = Parameters<typeof listDbScheduledTransactions>[0];

export function getDbScheduledTransactionToolDefinitions(
  dependencies: DbScheduledTransactionToolDependencies
): SliceToolDefinition[] {
  return [
    {
      name: "ynab_list_scheduled_transactions",
      title: "List YNAB Scheduled Transactions",
      description: "Lists scheduled transactions from the D1 read model with optional pagination and compact field projection.",
      inputSchema: {
        planId: z.string().optional(),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional(),
        fields: z.array(z.enum(scheduledTransactionFields)).optional(),
        includeIds: z.boolean().optional()
      },
      execute: async (input) => listDbScheduledTransactions(dependencies, input)
    },
    {
      name: "ynab_get_scheduled_transaction",
      title: "Get YNAB Scheduled Transaction",
      description: "Returns a compact summary for a single scheduled transaction from the D1 read model.",
      inputSchema: {
        planId: z.string().optional(),
        scheduledTransactionId: z.string().min(1)
      },
      execute: async (input) => getDbScheduledTransaction(dependencies, input)
    }
  ];
}
