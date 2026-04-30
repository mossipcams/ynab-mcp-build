import { describe, expect, it, vi } from "vitest";

import { DEFAULT_LIMIT } from "../../shared/collections.js";
import {
  getDbScheduledTransaction,
  searchDbScheduledTransactions,
} from "./service.js";

const repository = {
  usesServerPagination: true,
  getScheduledTransaction: vi.fn(),
  listScheduledTransactions: vi.fn(),
};

describe("DB-backed scheduled transaction service", () => {
  it("lists scheduled transactions with compact projection and pagination", async () => {
    repository.listScheduledTransactions.mockResolvedValueOnce({
      rows: [
        {
          id: "scheduled-1",
          date_first: "2026-04-01",
          date_next: "2026-05-01",
          amount_milliunits: -45000,
          payee_name: "Rent",
          category_name: "Housing",
          account_name: "Checking",
          flag_color: "blue",
          flag_name: "review",
          deleted: 0,
        },
      ],
      totalCount: 2,
    });

    await expect(
      searchDbScheduledTransactions(
        {
          defaultPlanId: "plan-1",
          scheduledTransactionsRepository: repository,
        },
        {
          fields: ["date_next", "amount", "payee_name"],
          includeIds: false,
          limit: 1,
          fromDate: "2026-05-01",
          accountId: "account-1",
        },
      ),
    ).resolves.toEqual({
      scheduled_transactions: [
        {
          date_next: "2026-05-01",
          amount: "-45.00",
          payee_name: "Rent",
        },
      ],
      scheduled_transaction_count: 2,
      limit: 1,
      offset: 0,
      returned_count: 1,
      has_more: true,
    });
    expect(repository.listScheduledTransactions).toHaveBeenCalledWith({
      accountId: "account-1",
      fromDate: "2026-05-01",
      limit: 1,
      offset: undefined,
      planId: "plan-1",
    });
  });

  it("returns a compact scheduled transaction detail", async () => {
    repository.getScheduledTransaction.mockResolvedValueOnce({
      id: "scheduled-1",
      date_first: "2026-04-01",
      date_next: "2026-05-01",
      amount_milliunits: -45000,
      payee_name: "Rent",
      category_name: "Housing",
      account_name: "Checking",
      flag_color: "blue",
      flag_name: "review",
      deleted: 0,
    });

    await expect(
      getDbScheduledTransaction(
        {
          defaultPlanId: "plan-1",
          scheduledTransactionsRepository: repository,
        },
        {
          scheduledTransactionId: "scheduled-1",
        },
      ),
    ).resolves.toEqual({
      scheduled_transaction: {
        id: "scheduled-1",
        date_first: "2026-04-01",
        date_next: "2026-05-01",
        amount: "-45.00",
        payee_name: "Rent",
        category_name: "Housing",
        account_name: "Checking",
        flag_color: "blue",
        flag_name: "review",
      },
    });
    expect(repository.getScheduledTransaction).toHaveBeenCalledWith({
      planId: "plan-1",
      scheduledTransactionId: "scheduled-1",
    });
  });

  it("applies the default page size in the repository for broad scheduled searches", async () => {
    repository.listScheduledTransactions.mockResolvedValueOnce({
      rows: [
        {
          id: "scheduled-1",
          date_first: "2026-04-01",
          date_next: "2026-05-01",
          amount_milliunits: -45000,
          deleted: 0,
        },
      ],
      totalCount: DEFAULT_LIMIT + 1,
    });

    await expect(
      searchDbScheduledTransactions(
        {
          defaultPlanId: "plan-1",
          scheduledTransactionsRepository: repository,
        },
        {},
      ),
    ).resolves.toMatchObject({
      scheduled_transaction_count: DEFAULT_LIMIT + 1,
      limit: DEFAULT_LIMIT,
      offset: 0,
      returned_count: 1,
      has_more: true,
    });
    expect(repository.listScheduledTransactions).toHaveBeenCalledWith({
      limit: DEFAULT_LIMIT,
      planId: "plan-1",
    });
  });

  it("honors offset-only scheduled searches with the default page size", async () => {
    repository.listScheduledTransactions.mockResolvedValueOnce({
      rows: [
        {
          id: "scheduled-2",
          date_first: "2026-04-01",
          date_next: "2026-05-01",
          amount_milliunits: -45000,
          deleted: 0,
        },
      ],
      totalCount: 10,
    });

    await expect(
      searchDbScheduledTransactions(
        {
          defaultPlanId: "plan-1",
          scheduledTransactionsRepository: repository,
        },
        {
          offset: 5,
        },
      ),
    ).resolves.toMatchObject({
      scheduled_transaction_count: 10,
      limit: DEFAULT_LIMIT,
      offset: 5,
      returned_count: 1,
      has_more: true,
    });
    expect(repository.listScheduledTransactions).toHaveBeenCalledWith({
      limit: DEFAULT_LIMIT,
      offset: 5,
      planId: "plan-1",
    });
  });

  it("falls back to the default plan when input plan ids are blank", async () => {
    repository.listScheduledTransactions.mockResolvedValueOnce({
      rows: [],
      totalCount: 0,
    });

    await searchDbScheduledTransactions(
      {
        defaultPlanId: "plan-1",
        scheduledTransactionsRepository: repository,
      },
      {
        planId: "   ",
      },
    );

    expect(repository.listScheduledTransactions).toHaveBeenLastCalledWith({
      limit: DEFAULT_LIMIT,
      planId: "plan-1",
    });
  });
});
