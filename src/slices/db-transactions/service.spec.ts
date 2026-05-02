import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

import { searchTransactions } from "./service.js";

describe("DB-backed transaction service", () => {
  it("passes high offsets to D1 and reports pagination from the full match count", async () => {
    const transactionsRepository = {
      summarizeTransactions: vi.fn(async () => ({
        topCategories: [],
        topPayees: [],
        totals: {
          inflowMilliunits: 0,
          outflowMilliunits: 12000,
        },
      })),
      searchTransactions: vi.fn(async () => ({
        rows: [
          {
            amount_milliunits: -12000,
            date: "2026-04-12",
            deleted: 0,
            id: "txn-601",
            payee_name: "Market",
          },
        ],
        totalCount: 650,
      })),
    };
    const freshness = {
      getFreshness: vi.fn(async () => ({
        health_status: "ok",
        last_synced_at: "2026-04-28T12:00:00.000Z",
        stale: false,
        warning: null,
      })),
    };

    const result = await searchTransactions(
      { defaultPlanId: "plan-1", freshness, transactionsRepository },
      {
        limit: 25,
        offset: 600,
      },
    );

    expect(transactionsRepository.searchTransactions).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 25,
        offset: 600,
      }),
    );
    expect(result).toMatchObject({
      data: {
        has_more: true,
        limit: 25,
        match_count: 650,
        offset: 600,
        returned_count: 1,
      },
      status: "ok",
    });
  });

  it("reports no additional page at the exact pagination end boundary", async () => {
    // DEFECT: has_more can stay true when offset plus returned rows lands exactly on the total count.
    const transactionsRepository = {
      searchTransactions: vi.fn(async () => ({
        rows: [
          {
            amount_milliunits: -12000,
            date: "2026-04-12",
            deleted: 0,
            id: "txn-100",
            payee_name: "Market",
          },
        ],
        totalCount: 101,
      })),
    };
    const freshness = {
      getFreshness: vi.fn(async () => ({
        health_status: "ok",
        last_synced_at: "2026-04-28T12:00:00.000Z",
        stale: false,
        warning: null,
      })),
    };

    const result = await searchTransactions(
      { defaultPlanId: "plan-1", freshness, transactionsRepository },
      {
        limit: 1,
        offset: 100,
      },
    );

    expect(result).toMatchObject({
      data: {
        has_more: false,
        limit: 1,
        match_count: 101,
        offset: 100,
        returned_count: 1,
      },
    });
  });

  it("searches D1 transactions with clamped limits and freshness metadata", async () => {
    const transactionsRepository = {
      searchTransactions: vi.fn(async () => ({
        rows: [
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
            deleted: 0,
          },
        ],
        totalCount: 1,
      })),
    };
    const freshness = {
      getFreshness: vi.fn(async () => ({
        health_status: "ok",
        last_synced_at: "2026-04-28T12:00:00.000Z",
        stale: false,
        warning: null,
      })),
    };

    const result = await searchTransactions(
      { defaultPlanId: "plan-1", freshness, transactionsRepository },
      {
        accountId: "account-1",
        categoryId: "category-1",
        fromDate: "2026-04-01",
        limit: 999,
        payeeId: "payee-1",
        toDate: "2026-04-30",
      },
    );

    expect(transactionsRepository.searchTransactions).toHaveBeenCalledWith({
      accountIds: ["account-1"],
      categoryIds: ["category-1"],
      endDate: "2026-04-30",
      includeDeleted: false,
      includeTransfers: false,
      limit: 500,
      offset: 0,
      payeeIds: ["payee-1"],
      planId: "plan-1",
      startDate: "2026-04-01",
    });
    expect(freshness.getFreshness).toHaveBeenCalledWith("plan-1", [
      "transactions",
    ]);
    expect(result).toEqual({
      status: "ok",
      data_freshness: {
        health_status: "ok",
        last_synced_at: "2026-04-28T12:00:00.000Z",
        required_endpoints: ["transactions"],
        stale: false,
        warning: null,
      },
      data: {
        filters: {
          account_id: "account-1",
          category_id: "category-1",
          from_date: "2026-04-01",
          include_transfers: false,
          payee_id: "payee-1",
          sort: "date_desc",
          to_date: "2026-04-30",
        },
        has_more: false,
        limit: 999,
        match_count: 1,
        offset: 0,
        returned_count: 1,
        transactions: [
          {
            account_name: "Checking",
            amount: "-12.00",
            approved: true,
            category_name: "Groceries",
            cleared: "cleared",
            date: "2026-04-12",
            id: "txn-1",
            payee_name: "Market",
          },
        ],
      },
    });
  });

  it("preserves public search filters, projection, pagination, sorting, and summaries", async () => {
    const transactionsRepository = {
      summarizeTransactions: vi.fn(async () => ({
        topCategories: [],
        topPayees: [],
        totals: {
          inflowMilliunits: 0,
          outflowMilliunits: 12000,
        },
      })),
      searchTransactions: vi.fn(async () => ({
        rows: [
          {
            id: "txn-approved-small",
            date: "2026-04-12",
            amount_milliunits: -3000,
            cleared: "cleared",
            approved: 1,
            account_id: "account-1",
            account_name: "Checking",
            payee_id: "payee-1",
            payee_name: "Market",
            category_id: "category-1",
            category_name: "Groceries",
            transfer_account_id: null,
            deleted: 0,
          },
        ],
        totalCount: 2,
      })),
    };
    const freshness = {
      getFreshness: vi.fn(async () => ({
        health_status: "ok",
        last_synced_at: "2026-04-28T12:00:00.000Z",
        stale: false,
        warning: null,
      })),
    };

    const result = await searchTransactions(
      { defaultPlanId: "plan-1", freshness, transactionsRepository },
      {
        approved: true,
        cleared: "cleared",
        fields: ["date", "amount", "payee_name"],
        includeIds: false,
        includeSummary: true,
        limit: 1,
        offset: 1,
        sort: "amount_asc",
      },
    );

    expect(transactionsRepository.searchTransactions).toHaveBeenCalledWith(
      expect.objectContaining({
        approved: true,
        cleared: "cleared",
        includeTransfers: false,
        limit: 1,
        offset: 1,
        sort: "amount_asc",
      }),
    );
    expect(transactionsRepository.summarizeTransactions).toHaveBeenCalledWith(
      expect.objectContaining({
        approved: true,
        cleared: "cleared",
        includeTransfers: false,
        planId: "plan-1",
      }),
    );
    expect(result).toMatchObject({
      status: "ok",
      data: {
        filters: {
          approved: true,
          cleared: "cleared",
          include_transfers: false,
          include_summary: true,
          sort: "amount_asc",
        },
        limit: 1,
        offset: 1,
        match_count: 2,
        returned_count: 1,
        transactions: [
          {
            amount: "-3.00",
            date: "2026-04-12",
            payee_name: "Market",
          },
        ],
        totals: {
          total_inflow: "0.00",
          total_outflow: "12.00",
          net: "-12.00",
        },
      },
    });
    expect(result.data?.transactions[0]).not.toHaveProperty("id");
  });

  it("maps month filters to calendar date ranges", async () => {
    const transactionsRepository = {
      searchTransactions: vi.fn(async () => ({
        rows: [],
        totalCount: 0,
      })),
    };
    const freshness = {
      getFreshness: vi.fn(async () => ({
        health_status: "ok",
        last_synced_at: "2026-04-28T12:00:00.000Z",
        stale: false,
        warning: null,
      })),
    };

    await searchTransactions(
      { defaultPlanId: "plan-1", freshness, transactionsRepository },
      {
        month: "2026-04-01",
      },
    );

    expect(transactionsRepository.searchTransactions).toHaveBeenCalledWith(
      expect.objectContaining({
        endDate: "2026-04-30",
        startDate: "2026-04-01",
      }),
    );
  });

  it("maps leap-year February and December month filters to exact calendar ranges", async () => {
    // DEFECT: month range math can miss leap days or fail when rolling December into January.
    const transactionsRepository = {
      searchTransactions: vi.fn(async () => ({
        rows: [],
        totalCount: 0,
      })),
    };
    const freshness = {
      getFreshness: vi.fn(async () => ({
        health_status: "ok",
        last_synced_at: "2026-04-28T12:00:00.000Z",
        stale: false,
        warning: null,
      })),
    };

    await searchTransactions(
      { defaultPlanId: "plan-1", freshness, transactionsRepository },
      {
        month: "2024-02-01",
      },
    );
    await searchTransactions(
      { defaultPlanId: "plan-1", freshness, transactionsRepository },
      {
        month: "2026-12-01",
      },
    );

    expect(transactionsRepository.searchTransactions).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        endDate: "2024-02-29",
        startDate: "2024-02-01",
      }),
    );
    expect(transactionsRepository.searchTransactions).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        endDate: "2026-12-31",
        startDate: "2026-12-01",
      }),
    );
  });

  it("treats public amount filters as decimal currency units", async () => {
    const transactionsRepository = {
      searchTransactions: vi.fn(async () => ({
        rows: [],
        totalCount: 0,
      })),
    };
    const freshness = {
      getFreshness: vi.fn(async () => ({
        health_status: "ok",
        last_synced_at: "2026-04-28T12:00:00.000Z",
        stale: false,
        warning: null,
      })),
    };

    const result = await searchTransactions(
      { defaultPlanId: "plan-1", freshness, transactionsRepository },
      {
        maxAmount: 100.25,
        minAmount: -25,
      },
    );

    expect(transactionsRepository.searchTransactions).toHaveBeenCalledWith(
      expect.objectContaining({
        maxAmountMilliunits: 100250,
        minAmountMilliunits: -25000,
      }),
    );
    expect(result).toMatchObject({
      data: {
        filters: {
          max_amount: "100.25",
          min_amount: "-25.00",
        },
      },
    });
  });

  it("passes absolute amount filters as decimal currency units", async () => {
    // DEFECT: users need an explicit absolute-value filter for transactions over or under a size regardless of inflow/outflow sign.
    const transactionsRepository = {
      searchTransactions: vi.fn(async () => ({
        rows: [],
        totalCount: 0,
      })),
    };
    const freshness = {
      getFreshness: vi.fn(async () => ({
        health_status: "ok",
        last_synced_at: "2026-04-28T12:00:00.000Z",
        stale: false,
        warning: null,
      })),
    };

    const result = await searchTransactions(
      { defaultPlanId: "plan-1", freshness, transactionsRepository },
      {
        maxAbsAmount: 200,
        minAbsAmount: 100,
      },
    );

    expect(transactionsRepository.searchTransactions).toHaveBeenCalledWith(
      expect.objectContaining({
        maxAbsAmountMilliunits: 200000,
        minAbsAmountMilliunits: 100000,
      }),
    );
    expect(result).toMatchObject({
      data: {
        filters: {
          max_abs_amount: "200.00",
          min_abs_amount: "100.00",
        },
      },
    });
  });

  it("rounds half-milliunit amount filters symmetrically by magnitude", async () => {
    // DEFECT: Math.round biases negative half-milliunit filters toward zero and makes min/max boundaries asymmetric.
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 1_000_000 }),
        async (milliunits) => {
          const transactionsRepository = {
            searchTransactions: vi.fn(async () => ({
              rows: [],
              totalCount: 0,
            })),
          };
          const freshness = {
            getFreshness: vi.fn(async () => ({
              health_status: "ok",
              last_synced_at: "2026-04-28T12:00:00.000Z",
              stale: false,
              warning: null,
            })),
          };
          const halfMilliunitAmount = (milliunits + 0.5) / 1000;

          await searchTransactions(
            { defaultPlanId: "plan-1", freshness, transactionsRepository },
            {
              maxAmount: halfMilliunitAmount,
              minAmount: -halfMilliunitAmount,
            },
          );

          expect(
            transactionsRepository.searchTransactions,
          ).toHaveBeenCalledWith(
            expect.objectContaining({
              maxAmountMilliunits: milliunits + 1,
              minAmountMilliunits: -(milliunits + 1),
            }),
          );
        },
      ),
    );
  });

  it("uses deterministic tie-breaking for local summary rollups with equal amounts and names", async () => {
    // DEFECT: equal summary rollups can flicker based on repository row order when amount and display name tie.
    const transactionsRepository = {
      searchTransactions: vi.fn(async () => ({
        rows: [
          {
            id: "txn-category-b",
            date: "2026-04-11",
            amount_milliunits: -10000,
            category_id: "category-b",
            category_name: "Shared",
            payee_id: "payee-b",
            payee_name: "Shared",
            deleted: 0,
          },
          {
            id: "txn-category-a",
            date: "2026-04-12",
            amount_milliunits: -10000,
            category_id: "category-a",
            category_name: "Shared",
            payee_id: "payee-a",
            payee_name: "Shared",
            deleted: 0,
          },
        ],
        totalCount: 2,
      })),
    };
    const freshness = {
      getFreshness: vi.fn(async () => ({
        health_status: "ok",
        last_synced_at: "2026-04-28T12:00:00.000Z",
        stale: false,
        warning: null,
      })),
    };

    const result = await searchTransactions(
      { defaultPlanId: "plan-1", freshness, transactionsRepository },
      { includeSummary: true },
    );

    expect(result.data).toMatchObject({
      top_categories: [
        expect.objectContaining({ id: "category-a", name: "Shared" }),
        expect.objectContaining({ id: "category-b", name: "Shared" }),
      ],
      top_payees: [
        expect.objectContaining({ id: "payee-a", name: "Shared" }),
        expect.objectContaining({ id: "payee-b", name: "Shared" }),
      ],
      totals: {
        net: "-20.00",
        total_inflow: "0.00",
        total_outflow: "20.00",
      },
    });
  });

  it("returns an unhealthy error without querying transactions when required sync never completed", async () => {
    const transactionsRepository = {
      searchTransactions: vi.fn(),
    };
    const freshness = {
      getFreshness: vi.fn(async () => ({
        health_status: "never_synced",
        last_synced_at: null,
        stale: true,
        warning: "Required endpoint transactions has never synced.",
      })),
    };

    const result = await searchTransactions(
      { defaultPlanId: "plan-1", freshness, transactionsRepository },
      {},
    );

    expect(transactionsRepository.searchTransactions).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "unhealthy",
      data_freshness: {
        health_status: "never_synced",
        last_synced_at: null,
        required_endpoints: ["transactions"],
        stale: true,
        warning: "Required endpoint transactions has never synced.",
      },
      next_action: {
        code: "sync_read_model",
        message:
          "Run the scheduled YNAB read-model sync for plan-1, then retry after endpoints are healthy: transactions.",
      },
      data: null,
    });
  });
});
