import { describe, expect, it, vi } from "vitest";

import {
  getDbScheduledTransaction,
  listDbScheduledTransactions
} from "./service.js";

const repository = {
  getScheduledTransaction: vi.fn(),
  listScheduledTransactions: vi.fn()
};

describe("DB-backed scheduled transaction service", () => {
  it("lists scheduled transactions with compact projection and pagination", async () => {
    repository.listScheduledTransactions.mockResolvedValueOnce([
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
        deleted: 0
      },
      {
        id: "scheduled-2",
        date_first: "2026-04-02",
        date_next: "2026-05-02",
        amount_milliunits: -2500,
        payee_name: "Music",
        category_name: "Subscriptions",
        account_name: "Credit Card",
        flag_color: null,
        flag_name: null,
        deleted: 0
      }
    ]);

    await expect(
      listDbScheduledTransactions(
        {
          defaultPlanId: "plan-1",
          scheduledTransactionsRepository: repository
        },
        {
          fields: ["date_next", "amount", "payee_name"],
          includeIds: false,
          limit: 1
        }
      )
    ).resolves.toEqual({
      scheduled_transactions: [
        {
          date_next: "2026-05-01",
          amount: "-45.00",
          payee_name: "Rent"
        }
      ],
      scheduled_transaction_count: 2,
      limit: 1,
      offset: 0,
      returned_count: 1,
      has_more: true
    });
    expect(repository.listScheduledTransactions).toHaveBeenCalledWith({
      planId: "plan-1"
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
      deleted: 0
    });

    await expect(
      getDbScheduledTransaction(
        {
          defaultPlanId: "plan-1",
          scheduledTransactionsRepository: repository
        },
        {
          scheduledTransactionId: "scheduled-1"
        }
      )
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
        flag_name: "review"
      }
    });
    expect(repository.getScheduledTransaction).toHaveBeenCalledWith({
      planId: "plan-1",
      scheduledTransactionId: "scheduled-1"
    });
  });

  it("falls back to the default plan when input plan ids are blank", async () => {
    repository.listScheduledTransactions.mockResolvedValueOnce([]);

    await listDbScheduledTransactions(
      {
        defaultPlanId: "plan-1",
        scheduledTransactionsRepository: repository
      },
      {
        planId: "   "
      }
    );

    expect(repository.listScheduledTransactions).toHaveBeenLastCalledWith({
      planId: "plan-1"
    });
  });
});
