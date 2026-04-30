import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  listTransactions,
  searchTransactions,
} from "../../../src/slices/transactions/service.js";
import { getDbTransactionToolDefinitions } from "../../../src/slices/db-transactions/tools.js";

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
          transferAccountId: "account-2",
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
          transferAccountId: null,
        },
      ]),
    };

    await expect(
      searchTransactions(ynabClient as never, {
        planId: "plan-1",
      }),
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
          cleared: "cleared",
        },
      ],
      match_count: 1,
      filters: {
        include_transfers: false,
        sort: "date_desc",
      },
    });
    expect(ynabClient.listPlans).not.toHaveBeenCalled();
    expect(ynabClient.listTransactions).toHaveBeenCalledWith(
      "plan-1",
      undefined,
    );
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
          transferAccountId: "account-2",
        },
      ]),
    };

    await expect(
      searchTransactions(ynabClient as never, {
        planId: "plan-1",
        includeTransfers: true,
      }),
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
          cleared: "cleared",
        },
      ],
      match_count: 1,
      filters: {
        include_transfers: true,
        sort: "date_desc",
      },
    });
  });

  it("applies every explicit transaction search filter and preserves formatted filter metadata", async () => {
    // DEFECT: transaction search can silently ignore individual filters or lose the formatted filter summary that callers rely on.
    const ynabClient = {
      listPlans: vi.fn(),
      listTransactions: vi.fn().mockResolvedValue([
        {
          id: "txn-too-new",
          date: "2026-04-13",
          amount: -2500,
          payeeId: "payee-1",
          payeeName: "Exact Match",
          categoryId: "category-1",
          categoryName: "Groceries",
          accountId: "account-1",
          accountName: "Checking",
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: null,
        },
        {
          id: "txn-deleted",
          date: "2026-04-12",
          amount: -2500,
          payeeId: "payee-1",
          payeeName: "Deleted Match",
          categoryId: "category-1",
          categoryName: "Groceries",
          accountId: "account-1",
          accountName: "Checking",
          approved: true,
          cleared: "cleared",
          deleted: true,
          transferAccountId: null,
        },
        {
          id: "txn-wrong-payee",
          date: "2026-04-12",
          amount: -2500,
          payeeId: "payee-2",
          payeeName: "Other Payee",
          categoryId: "category-1",
          categoryName: "Groceries",
          accountId: "account-1",
          accountName: "Checking",
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: null,
        },
        {
          id: "txn-wrong-account",
          date: "2026-04-12",
          amount: -2500,
          payeeId: "payee-1",
          payeeName: "Exact Match",
          categoryId: "category-1",
          categoryName: "Groceries",
          accountId: "account-2",
          accountName: "Savings",
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: null,
        },
        {
          id: "txn-wrong-category",
          date: "2026-04-12",
          amount: -2500,
          payeeId: "payee-1",
          payeeName: "Exact Match",
          categoryId: "category-2",
          categoryName: "Dining",
          accountId: "account-1",
          accountName: "Checking",
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: null,
        },
        {
          id: "txn-unapproved",
          date: "2026-04-12",
          amount: -2500,
          payeeId: "payee-1",
          payeeName: "Exact Match",
          categoryId: "category-1",
          categoryName: "Groceries",
          accountId: "account-1",
          accountName: "Checking",
          approved: false,
          cleared: "cleared",
          deleted: false,
          transferAccountId: null,
        },
        {
          id: "txn-uncleared",
          date: "2026-04-12",
          amount: -2500,
          payeeId: "payee-1",
          payeeName: "Exact Match",
          categoryId: "category-1",
          categoryName: "Groceries",
          accountId: "account-1",
          accountName: "Checking",
          approved: true,
          cleared: "uncleared",
          deleted: false,
          transferAccountId: null,
        },
        {
          id: "txn-too-small",
          date: "2026-04-12",
          amount: -2600,
          payeeId: "payee-1",
          payeeName: "Exact Match",
          categoryId: "category-1",
          categoryName: "Groceries",
          accountId: "account-1",
          accountName: "Checking",
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: null,
        },
        {
          id: "txn-too-large",
          date: "2026-04-12",
          amount: -2400,
          payeeId: "payee-1",
          payeeName: "Exact Match",
          categoryId: "category-1",
          categoryName: "Groceries",
          accountId: "account-1",
          accountName: "Checking",
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: null,
        },
        {
          id: "txn-match",
          date: "2026-04-12",
          amount: -2500,
          payeeId: "payee-1",
          payeeName: "Exact Match",
          categoryId: "category-1",
          categoryName: "Groceries",
          accountId: "account-1",
          accountName: "Checking",
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: null,
        },
      ]),
    };

    await expect(
      searchTransactions(ynabClient as never, {
        planId: "plan-1",
        toDate: "2026-04-12",
        payeeId: "payee-1",
        accountId: "account-1",
        categoryId: "category-1",
        approved: true,
        cleared: "cleared",
        minAmount: -2500,
        maxAmount: -2500,
        fields: ["date", "amount", "payee_name"],
      }),
    ).resolves.toEqual({
      transactions: [
        {
          id: "txn-match",
          date: "2026-04-12",
          amount: "-2.50",
          payee_name: "Exact Match",
        },
      ],
      match_count: 1,
      filters: {
        to_date: "2026-04-12",
        payee_id: "payee-1",
        account_id: "account-1",
        category_id: "category-1",
        approved: true,
        cleared: "cleared",
        min_amount: "-2.50",
        max_amount: "-2.50",
        include_transfers: false,
        sort: "date_desc",
      },
    });
    expect(ynabClient.listTransactions).toHaveBeenCalledWith(
      "plan-1",
      undefined,
    );
  });

  it("sorts transactions by date ascending and uses ids as the final tie-breaker", async () => {
    // DEFECT: ascending date sort can silently fall back to insertion order instead of the documented date and id ordering.
    const ynabClient = {
      listPlans: vi.fn(),
      listTransactions: vi.fn().mockResolvedValue([
        {
          id: "txn-b",
          date: "2026-04-12",
          amount: -500,
          payeeId: "payee-1",
          payeeName: "Coffee",
          categoryId: "category-1",
          categoryName: "Dining",
          accountId: "account-1",
          accountName: "Checking",
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: null,
        },
        {
          id: "txn-a",
          date: "2026-04-12",
          amount: -500,
          payeeId: "payee-2",
          payeeName: "Bakery",
          categoryId: "category-1",
          categoryName: "Dining",
          accountId: "account-1",
          accountName: "Checking",
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: null,
        },
        {
          id: "txn-c",
          date: "2026-04-10",
          amount: -500,
          payeeId: "payee-3",
          payeeName: "Taxi",
          categoryId: "category-2",
          categoryName: "Transport",
          accountId: "account-1",
          accountName: "Checking",
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: null,
        },
      ]),
    };

    await expect(
      searchTransactions(ynabClient as never, {
        planId: "plan-1",
        sort: "date_asc",
        fields: ["date", "payee_name"],
        includeIds: false,
      }),
    ).resolves.toEqual({
      transactions: [
        {
          date: "2026-04-10",
          payee_name: "Taxi",
        },
        {
          date: "2026-04-12",
          payee_name: "Bakery",
        },
        {
          date: "2026-04-12",
          payee_name: "Coffee",
        },
      ],
      match_count: 3,
      filters: {
        include_transfers: false,
        sort: "date_asc",
      },
    });
  });

  it("sorts transactions by amount ascending and paginates before projecting the selected fields", async () => {
    // DEFECT: transaction listing can skip sorting or return the wrong result shape when pagination and field projection are combined.
    const ynabClient = {
      listPlans: vi.fn(),
      listTransactions: vi.fn().mockResolvedValue([
        {
          id: "txn-1",
          date: "2026-04-11",
          amount: -500,
          payeeId: "payee-1",
          payeeName: "Coffee",
          categoryId: "category-1",
          categoryName: "Dining",
          accountId: "account-1",
          accountName: "Checking",
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: null,
        },
        {
          id: "txn-2",
          date: "2026-04-12",
          amount: -2500,
          payeeId: "payee-2",
          payeeName: "Grocer",
          categoryId: "category-2",
          categoryName: "Groceries",
          accountId: "account-1",
          accountName: "Checking",
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: null,
        },
        {
          id: "txn-3",
          date: "2026-04-10",
          amount: -1200,
          payeeId: "payee-3",
          payeeName: "Books",
          categoryId: "category-3",
          categoryName: "Education",
          accountId: "account-1",
          accountName: "Checking",
          approved: false,
          cleared: "uncleared",
          deleted: false,
          transferAccountId: null,
        },
        {
          id: "txn-4",
          date: "2026-04-09",
          amount: -1200,
          payeeId: "payee-4",
          payeeName: "Museum",
          categoryId: "category-4",
          categoryName: "Fun",
          accountId: "account-1",
          accountName: "Checking",
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: null,
        },
      ]),
    };

    await expect(
      searchTransactions(ynabClient as never, {
        planId: "plan-1",
        sort: "amount_asc",
        limit: 1,
        offset: 2,
        fields: ["date", "amount"],
      }),
    ).resolves.toEqual({
      transactions: [
        {
          id: "txn-4",
          date: "2026-04-09",
          amount: "-1.20",
        },
      ],
      match_count: 4,
      limit: 1,
      offset: 2,
      returned_count: 1,
      has_more: true,
      filters: {
        include_transfers: false,
        sort: "amount_asc",
      },
    });
  });

  it("lists transactions in descending date order with stable id tie-breaking", async () => {
    // DEFECT: the default transaction listing can drift from documented date-desc ordering when dates tie or sort logic changes.
    const ynabClient = {
      listPlans: vi.fn(),
      listTransactions: vi.fn().mockResolvedValue([
        {
          id: "txn-b",
          date: "2026-04-12",
          amount: -500,
          payeeId: "payee-1",
          payeeName: "Coffee",
          categoryId: "category-1",
          categoryName: "Dining",
          accountId: "account-1",
          accountName: "Checking",
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: null,
        },
        {
          id: "txn-a",
          date: "2026-04-12",
          amount: -300,
          payeeId: "payee-2",
          payeeName: "Snack",
          categoryId: "category-1",
          categoryName: "Dining",
          accountId: "account-1",
          accountName: "Checking",
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: null,
        },
        {
          id: "txn-c",
          date: "2026-04-11",
          amount: -700,
          payeeId: "payee-3",
          payeeName: "Taxi",
          categoryId: "category-2",
          categoryName: "Transport",
          accountId: "account-1",
          accountName: "Checking",
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: null,
        },
        {
          id: "txn-deleted",
          date: "2026-04-13",
          amount: -900,
          payeeId: "payee-4",
          payeeName: "Deleted",
          categoryId: "category-3",
          categoryName: "Hidden",
          accountId: "account-1",
          accountName: "Checking",
          approved: true,
          cleared: "cleared",
          deleted: true,
          transferAccountId: null,
        },
      ]),
    };

    await expect(
      listTransactions(ynabClient as never, { planId: "plan-1" }),
    ).resolves.toEqual({
      transactions: [
        {
          id: "txn-a",
          date: "2026-04-12",
          amount: "-0.30",
          payee_name: "Snack",
          category_name: "Dining",
          account_name: "Checking",
          approved: true,
          cleared: "cleared",
        },
        {
          id: "txn-b",
          date: "2026-04-12",
          amount: "-0.50",
          payee_name: "Coffee",
          category_name: "Dining",
          account_name: "Checking",
          approved: true,
          cleared: "cleared",
        },
        {
          id: "txn-c",
          date: "2026-04-11",
          amount: "-0.70",
          payee_name: "Taxi",
          category_name: "Transport",
          account_name: "Checking",
          approved: true,
          cleared: "cleared",
        },
      ],
      transaction_count: 3,
    });
  });

  it("rejects invalid transaction search sort values at the tool schema boundary", () => {
    // DEFECT: the transaction search tool can accept unsupported sort values and leave downstream handlers with ambiguous ordering behavior.
    const definitions = getDbTransactionToolDefinitions({
      freshness: {} as never,
      transactionsRepository: {} as never,
    });
    const searchTool = definitions.find(
      (definition) => definition.name === "ynab_search_transactions",
    );

    expect(searchTool).toBeDefined();
    expect(() =>
      z.object(searchTool?.inputSchema ?? {}).parse({
        sort: "newest_first",
      }),
    ).toThrow();
  });
});
