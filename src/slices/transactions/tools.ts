import { z } from "zod";

import type { YnabClient } from "../../platform/ynab/client.js";
import type { SliceToolDefinition } from "../../shared/tool-definition.js";
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
    {
      name: "ynab_list_transactions",
      title: "List YNAB Transactions",
      description: "Lists YNAB transactions with optional pagination and compact field projection. Use only when the user explicitly asks for raw transaction browsing.",
      inputSchema: {
        planId: z.string().optional(),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional(),
        fields: z.array(z.enum(transactionFields)).optional(),
        includeIds: z.boolean().optional()
      },
      execute: async (input) => listTransactions(ynabClient, input)
    },
    {
      name: "ynab_get_transaction",
      title: "Get YNAB Transaction",
      description: "Returns a compact summary for a single individual transaction. Use for exact transaction inspection after a drilldown.",
      inputSchema: {
        planId: z.string().optional(),
        transactionId: z.string().min(1)
      },
      execute: async (input) => getTransaction(ynabClient, input)
    },
    {
      name: "ynab_search_transactions",
      title: "Search YNAB Transactions",
      description: "Searches YNAB transactions with compact filters, rollups, projections, pagination, and sorting. Use for transaction detail or follow-up drilldowns.",
      inputSchema: {
        planId: z.string().optional(),
        fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        payeeId: z.string().optional(),
        accountId: z.string().optional(),
        categoryId: z.string().optional(),
        approved: z.boolean().optional(),
        cleared: z.string().optional(),
        minAmount: z.number().optional(),
        maxAmount: z.number().optional(),
        includeTransfers: z.boolean().optional(),
        includeSummary: z.boolean().optional(),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional(),
        fields: z.array(z.enum(transactionFields)).optional(),
        includeIds: z.boolean().optional(),
        sort: z.enum(sortableValues).optional()
      },
      execute: async (input) => searchTransactions(ynabClient, input)
    },
    {
      name: "ynab_get_transactions_by_month",
      title: "Get YNAB Transactions By Month",
      description: "Lists transactions for a single plan month. Use for month-specific transaction drilldowns after a summary.",
      inputSchema: {
        planId: z.string().optional(),
        month: z.string().min(1),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional(),
        fields: z.array(z.enum(transactionFields)).optional(),
        includeIds: z.boolean().optional()
      },
      execute: async (input) => getTransactionsByMonth(ynabClient, input)
    },
    {
      name: "ynab_get_transactions_by_account",
      title: "Get YNAB Transactions By Account",
      description: "Lists transactions for a single account. Use only when the user explicitly asks for account-specific raw records.",
      inputSchema: {
        planId: z.string().optional(),
        accountId: z.string().min(1),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional(),
        fields: z.array(z.enum(transactionFields)).optional(),
        includeIds: z.boolean().optional()
      },
      execute: async (input) => getTransactionsByAccount(ynabClient, input)
    },
    {
      name: "ynab_get_transactions_by_category",
      title: "Get YNAB Transactions By Category",
      description: "Lists transactions for a single category. Use only when the user explicitly asks for category-specific raw records.",
      inputSchema: {
        planId: z.string().optional(),
        categoryId: z.string().min(1),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional(),
        fields: z.array(z.enum(transactionFields)).optional(),
        includeIds: z.boolean().optional()
      },
      execute: async (input) => getTransactionsByCategory(ynabClient, input)
    },
    {
      name: "ynab_get_transactions_by_payee",
      title: "Get YNAB Transactions By Payee",
      description: "Lists transactions for a single payee. Use only when the user explicitly asks for payee-specific raw records.",
      inputSchema: {
        planId: z.string().optional(),
        payeeId: z.string().min(1),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional(),
        fields: z.array(z.enum(transactionFields)).optional(),
        includeIds: z.boolean().optional()
      },
      execute: async (input) => getTransactionsByPayee(ynabClient, input)
    },
    {
      name: "ynab_list_scheduled_transactions",
      title: "List YNAB Scheduled Transactions",
      description: "Lists scheduled transactions with optional pagination and compact field projection. Use only when the user explicitly asks for raw scheduled records.",
      inputSchema: {
        planId: z.string().optional(),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional(),
        fields: z.array(z.enum(scheduledTransactionFields)).optional(),
        includeIds: z.boolean().optional()
      },
      execute: async (input) => listScheduledTransactions(ynabClient, input)
    },
    {
      name: "ynab_get_scheduled_transaction",
      title: "Get YNAB Scheduled Transaction",
      description: "Returns a compact summary for a single scheduled transaction.",
      inputSchema: {
        planId: z.string().optional(),
        scheduledTransactionId: z.string().min(1)
      },
      execute: async (input) => getScheduledTransaction(ynabClient, input)
    }
  ];
}
