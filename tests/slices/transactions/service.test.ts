import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { searchTransactions } from "../../../src/slices/transactions/service.js";
import { getTransactionToolDefinitions } from "../../../src/slices/transactions/tools.js";

describe("transactions service", () => {
  it("excludes transfer transactions from search results by default", async () => {
    // DEFECT: transaction search can leak transfer rows into normal results even when include_transfers defaults to false.
    const ynabClient = {
      listPlans: vi.fn(),
      listTransactions: vi.fn().mockResolvedValue([
        {
          id: "txn-transfer",
          date: "2026-04-12",
          amount: -5000,
          payeeId: "payee-1",
          payeeName: "Transfer",
          categoryId: null,
          categoryName: null,
          accountId: "account-1",
          accountName: "Checking",
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: "account-2"
        },
        {
          id: "txn-spend",
          date: "2026-04-11",
          amount: -2500,
          payeeId: "payee-2",
          payeeName: "Grocer",
          categoryId: "category-1",
          categoryName: "Groceries",
          accountId: "account-1",
          accountName: "Checking",
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: null
        }
      ])
    };

    await expect(
      searchTransactions(ynabClient as never, {
        planId: "plan-1"
      })
    ).resolves.toEqual({
      transactions: [
        {
          id: "txn-spend",
          date: "2026-04-11",
          amount: "-2.50",
          payee_name: "Grocer",
          category_name: "Groceries",
          account_name: "Checking",
          approved: true,
          cleared: "cleared"
        }
      ],
      match_count: 1,
      filters: {
        include_transfers: false,
        sort: "date_desc"
      }
    });
    expect(ynabClient.listPlans).not.toHaveBeenCalled();
    expect(ynabClient.listTransactions).toHaveBeenCalledWith("plan-1", undefined);
  });

  it("includes transfer transactions when includeTransfers is explicitly true", async () => {
    // DEFECT: transaction search can ignore an explicit include_transfers request and hide transfer rows from advanced clients.
    const ynabClient = {
      listPlans: vi.fn(),
      listTransactions: vi.fn().mockResolvedValue([
        {
          id: "txn-transfer",
          date: "2026-04-12",
          amount: -5000,
          payeeId: "payee-1",
          payeeName: "Transfer",
          categoryId: null,
          categoryName: null,
          accountId: "account-1",
          accountName: "Checking",
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: "account-2"
        }
      ])
    };

    await expect(
      searchTransactions(ynabClient as never, {
        planId: "plan-1",
        includeTransfers: true
      })
    ).resolves.toEqual({
      transactions: [
        {
          id: "txn-transfer",
          date: "2026-04-12",
          amount: "-5.00",
          payee_name: "Transfer",
          category_name: null,
          account_name: "Checking",
          approved: true,
          cleared: "cleared"
        }
      ],
      match_count: 1,
      filters: {
        include_transfers: true,
        sort: "date_desc"
      }
    });
  });

  it("rejects invalid transaction search sort values at the tool schema boundary", () => {
    // DEFECT: the transaction search tool can accept unsupported sort values and leave downstream handlers with ambiguous ordering behavior.
    const ynabClient = {
      listPlans: vi.fn(),
      listTransactions: vi.fn()
    };
    const definitions = getTransactionToolDefinitions(ynabClient as never);
    const searchTool = definitions.find((definition) => definition.name === "ynab_search_transactions");

    expect(searchTool).toBeDefined();
    expect(() =>
      z.object(searchTool?.inputSchema ?? {}).parse({
        sort: "newest_first"
      })
    ).toThrow();
  });
});
