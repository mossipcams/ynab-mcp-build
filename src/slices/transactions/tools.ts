import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { YnabClient } from "../../platform/ynab/client.js";
import { toErrorResult, toTextResult } from "../../shared/results.js";
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

export function registerTransactionTools(server: McpServer, ynabClient: YnabClient) {
  server.registerTool(
    "ynab_list_transactions",
    {
      title: "List YNAB Transactions",
      description: "Lists YNAB transactions with optional pagination and compact field projection.",
      inputSchema: {
        planId: z.string().optional(),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional(),
        fields: z.array(z.enum(transactionFields)).optional(),
        includeIds: z.boolean().optional()
      }
    },
    async (input) => {
      try {
        return toTextResult(await listTransactions(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_transaction",
    {
      title: "Get YNAB Transaction",
      description: "Returns a compact summary for a single YNAB transaction.",
      inputSchema: {
        planId: z.string().optional(),
        transactionId: z.string().min(1)
      }
    },
    async (input) => {
      try {
        return toTextResult(await getTransaction(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_search_transactions",
    {
      title: "Search YNAB Transactions",
      description: "Searches YNAB transactions with compact filters, projections, pagination, and sorting.",
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
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional(),
        fields: z.array(z.enum(transactionFields)).optional(),
        includeIds: z.boolean().optional(),
        sort: z.enum(sortableValues).optional()
      }
    },
    async (input) => {
      try {
        return toTextResult(await searchTransactions(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_transactions_by_month",
    {
      title: "Get YNAB Transactions By Month",
      description: "Lists transactions for a single plan month.",
      inputSchema: {
        planId: z.string().optional(),
        month: z.string().min(1),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional(),
        fields: z.array(z.enum(transactionFields)).optional(),
        includeIds: z.boolean().optional()
      }
    },
    async (input) => {
      try {
        return toTextResult(await getTransactionsByMonth(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_transactions_by_account",
    {
      title: "Get YNAB Transactions By Account",
      description: "Lists transactions for a single account.",
      inputSchema: {
        planId: z.string().optional(),
        accountId: z.string().min(1),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional(),
        fields: z.array(z.enum(transactionFields)).optional(),
        includeIds: z.boolean().optional()
      }
    },
    async (input) => {
      try {
        return toTextResult(await getTransactionsByAccount(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_transactions_by_category",
    {
      title: "Get YNAB Transactions By Category",
      description: "Lists transactions for a single category.",
      inputSchema: {
        planId: z.string().optional(),
        categoryId: z.string().min(1),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional(),
        fields: z.array(z.enum(transactionFields)).optional(),
        includeIds: z.boolean().optional()
      }
    },
    async (input) => {
      try {
        return toTextResult(await getTransactionsByCategory(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_transactions_by_payee",
    {
      title: "Get YNAB Transactions By Payee",
      description: "Lists transactions for a single payee.",
      inputSchema: {
        planId: z.string().optional(),
        payeeId: z.string().min(1),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional(),
        fields: z.array(z.enum(transactionFields)).optional(),
        includeIds: z.boolean().optional()
      }
    },
    async (input) => {
      try {
        return toTextResult(await getTransactionsByPayee(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_list_scheduled_transactions",
    {
      title: "List YNAB Scheduled Transactions",
      description: "Lists scheduled transactions with optional pagination and compact field projection.",
      inputSchema: {
        planId: z.string().optional(),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional(),
        fields: z.array(z.enum(scheduledTransactionFields)).optional(),
        includeIds: z.boolean().optional()
      }
    },
    async (input) => {
      try {
        return toTextResult(await listScheduledTransactions(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_scheduled_transaction",
    {
      title: "Get YNAB Scheduled Transaction",
      description: "Returns a compact summary for a single scheduled transaction.",
      inputSchema: {
        planId: z.string().optional(),
        scheduledTransactionId: z.string().min(1)
      }
    },
    async (input) => {
      try {
        return toTextResult(await getScheduledTransaction(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );
}
