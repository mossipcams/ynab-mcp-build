import { describe, expect, it, vi } from "vitest";

import { searchTransactions } from "./service.js";

describe("DB-backed transaction service", () => {
  it("searches D1 transactions with clamped limits and freshness metadata", async () => {
    const transactionsRepository = {
      searchTransactions: vi.fn(async () => [
        {
          id: "txn-1",
          date: "2026-04-12",
          amount_milliunits: -12000,
          memo: "weekly run",
          cleared: "cleared",
          approved: 1,
          flag_color: "blue",
          flag_name: "follow up",
          account_id: "account-1",
          account_name: "Checking",
          payee_id: "payee-1",
          payee_name: "Market",
          category_id: "category-1",
          category_name: "Groceries",
          transfer_account_id: null,
          transfer_transaction_id: "transfer-txn-1",
          matched_transaction_id: "matched-txn-1",
          import_id: "YNAB:-12000:2026-04-12:1",
          import_payee_name: "MKT",
          import_payee_name_original: "Market Original",
          debt_transaction_type: "payment",
          deleted: 0
        }
      ])
    };
    const freshness = {
      getFreshness: vi.fn(async () => ({
        health_status: "ok",
        last_synced_at: "2026-04-28T12:00:00.000Z",
        stale: false,
        warning: null
      }))
    };

    const result = await searchTransactions(
      { defaultPlanId: "plan-1", freshness, transactionsRepository },
      {
        accountId: "account-1",
        categoryId: "category-1",
        fromDate: "2026-04-01",
        limit: 999,
        payeeId: "payee-1",
        toDate: "2026-04-30"
      }
    );

    expect(transactionsRepository.searchTransactions).toHaveBeenCalledWith({
      accountIds: ["account-1"],
      categoryIds: ["category-1"],
      endDate: "2026-04-30",
      includeDeleted: false,
      limit: 500,
      payeeIds: ["payee-1"],
      payeeSearch: undefined,
      planId: "plan-1",
      startDate: "2026-04-01"
    });
    expect(freshness.getFreshness).toHaveBeenCalledWith("plan-1", ["transactions"]);
    expect(result).toEqual({
      status: "ok",
      data_freshness: {
        health_status: "ok",
        last_synced_at: "2026-04-28T12:00:00.000Z",
        required_endpoints: ["transactions"],
        stale: false,
        warning: null
      },
      data: {
        match_count: 1,
        transactions: [
          {
            account_id: "account-1",
            account_name: "Checking",
            amount: "-12.00",
            amount_milliunits: -12000,
            approved: true,
            category_id: "category-1",
            category_name: "Groceries",
            cleared: "cleared",
            date: "2026-04-12",
            debt_transaction_type: "payment",
            flag_color: "blue",
            flag_name: "follow up",
            id: "txn-1",
            import_id: "YNAB:-12000:2026-04-12:1",
            import_payee_name: "MKT",
            import_payee_name_original: "Market Original",
            matched_transaction_id: "matched-txn-1",
            memo: "weekly run",
            payee_id: "payee-1",
            payee_name: "Market",
            transfer_account_id: null,
            transfer_transaction_id: "transfer-txn-1"
          }
        ]
      }
    });
  });

  it("returns an unhealthy error without querying transactions when required sync never completed", async () => {
    const transactionsRepository = {
      searchTransactions: vi.fn()
    };
    const freshness = {
      getFreshness: vi.fn(async () => ({
        health_status: "never_synced",
        last_synced_at: null,
        stale: true,
        warning: "Required endpoint transactions has never synced."
      }))
    };

    const result = await searchTransactions(
      { defaultPlanId: "plan-1", freshness, transactionsRepository },
      {}
    );

    expect(transactionsRepository.searchTransactions).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "unhealthy",
      data_freshness: {
        health_status: "never_synced",
        last_synced_at: null,
        required_endpoints: ["transactions"],
        stale: true,
        warning: "Required endpoint transactions has never synced."
      },
      data: null
    });
  });
});
