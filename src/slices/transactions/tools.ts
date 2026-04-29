import { z } from "zod";

import type { YnabClient } from "../../platform/ynab/client.js";
import { defineTool, type SliceToolDefinition } from "../../shared/tool-definition.js";
import {
  amountFilterSchema,
  clearedStatusSchema,
  dateFieldSchema,
  fieldProjectionSchema,
  includeIdsSchema,
  paginatedProjectionSchema,
  paginationSchema,
  planIdSchema,
  requiredIdSchema,
  requiredMonthSchema
} from "../../shared/tool-inputs.js";
import {
  getTransaction,
  getScheduledTransaction,
  getTransactionsByAccount,
  getTransactionsByCategory,
  getTransactionsByMonth,
  getTransactionsByPayee,
  listTransactions,
  listScheduledTransactions,
  searchTransactions
} from "./service.js";

const transactionFields = ["date", "amount", "payee_name", "category_name", "account_name", "approved", "cleared"] as const;
const sortableValues = ["date_asc", "date_desc", "amount_asc", "amount_desc"] as const;
const scheduledTransactionFields = [
  "date_first",
  "date_next",
  "amount",
  "payee_name",
  "category_name",
  "account_name"
] as const;

export function getTransactionToolDefinitions(ynabClient: YnabClient): SliceToolDefinition[] {
  return [
    defineTool({
      name: "ynab_list_transactions",
      title: "List YNAB Transactions",
      description: "Lists YNAB transactions with optional pagination and compact field projection. Use only when the user explicitly asks for raw transaction browsing.",
      inputSchema: paginatedProjectionSchema(transactionFields),
      execute: async (input) => listTransactions(ynabClient, input)
    }),
    defineTool({
      name: "ynab_get_transaction",
      title: "Get YNAB Transaction",
      description: "Returns a compact summary for a single individual transaction. Use for exact transaction inspection after a drilldown.",
      inputSchema: {
        ...planIdSchema,
        transactionId: requiredIdSchema
      },
      execute: async (input) => getTransaction(ynabClient, input)
    }),
    defineTool({
      name: "ynab_search_transactions",
      title: "Search YNAB Transactions",
      description: "Searches YNAB transactions with compact filters, rollups, projections, pagination, and sorting. Use for transaction detail or follow-up drilldowns.",
      inputSchema: {
        ...planIdSchema,
        fromDate: dateFieldSchema.optional(),
        toDate: dateFieldSchema.optional(),
        payeeId: z.string().optional(),
        accountId: z.string().optional(),
        categoryId: z.string().optional(),
        approved: z.boolean().optional(),
        cleared: clearedStatusSchema.optional(),
        minAmount: amountFilterSchema.optional(),
        maxAmount: amountFilterSchema.optional(),
        includeTransfers: z.boolean().optional(),
        includeSummary: z.boolean().optional(),
        ...paginationSchema,
        fields: fieldProjectionSchema(transactionFields),
        ...includeIdsSchema,
        sort: z.enum(sortableValues).optional()
      },
      execute: async (input) => searchTransactions(ynabClient, input)
    }),
    defineTool({
      name: "ynab_get_transactions_by_month",
      title: "Get YNAB Transactions By Month",
      description: "Lists transactions for a single plan month. Use for month-specific transaction drilldowns after a summary.",
      inputSchema: {
        ...planIdSchema,
        month: requiredMonthSchema,
        ...paginationSchema,
        fields: fieldProjectionSchema(transactionFields),
        ...includeIdsSchema
      },
      execute: async (input) => getTransactionsByMonth(ynabClient, input)
    }),
    defineTool({
      name: "ynab_get_transactions_by_account",
      title: "Get YNAB Transactions By Account",
      description: "Lists transactions for a single account. Use only when the user explicitly asks for account-specific raw records.",
      inputSchema: {
        ...planIdSchema,
        accountId: requiredIdSchema,
        ...paginationSchema,
        fields: fieldProjectionSchema(transactionFields),
        ...includeIdsSchema
      },
      execute: async (input) => getTransactionsByAccount(ynabClient, input)
    }),
    defineTool({
      name: "ynab_get_transactions_by_category",
      title: "Get YNAB Transactions By Category",
      description: "Lists transactions for a single category. Use only when the user explicitly asks for category-specific raw records.",
      inputSchema: {
        ...planIdSchema,
        categoryId: requiredIdSchema,
        ...paginationSchema,
        fields: fieldProjectionSchema(transactionFields),
        ...includeIdsSchema
      },
      execute: async (input) => getTransactionsByCategory(ynabClient, input)
    }),
    defineTool({
      name: "ynab_get_transactions_by_payee",
      title: "Get YNAB Transactions By Payee",
      description: "Lists transactions for a single payee. Use only when the user explicitly asks for payee-specific raw records.",
      inputSchema: {
        ...planIdSchema,
        payeeId: requiredIdSchema,
        ...paginationSchema,
        fields: fieldProjectionSchema(transactionFields),
        ...includeIdsSchema
      },
      execute: async (input) => getTransactionsByPayee(ynabClient, input)
    }),
    defineTool({
      name: "ynab_list_scheduled_transactions",
      title: "List YNAB Scheduled Transactions",
      description: "Lists scheduled transactions with optional pagination and compact field projection. Use only when the user explicitly asks for raw scheduled records.",
      inputSchema: paginatedProjectionSchema(scheduledTransactionFields),
      execute: async (input) => listScheduledTransactions(ynabClient, input)
    }),
    defineTool({
      name: "ynab_get_scheduled_transaction",
      title: "Get YNAB Scheduled Transaction",
      description: "Returns a compact summary for a single scheduled transaction.",
      inputSchema: {
        ...planIdSchema,
        scheduledTransactionId: requiredIdSchema
      },
      execute: async (input) => getScheduledTransaction(ynabClient, input)
    })
  ];
}
