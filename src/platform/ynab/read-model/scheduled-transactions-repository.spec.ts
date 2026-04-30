import { describe, expect, it } from "vitest";

import { createScheduledTransactionsRepository } from "./scheduled-transactions-repository.js";

type BoundStatement = {
  sql: string;
  params: unknown[];
};

class FakeStatement {
  constructor(
    private readonly db: FakeD1Database,
    readonly sql: string,
  ) {}

  bind(...params: unknown[]) {
    this.db.calls.push({ sql: this.sql, params });

    return {
      all: async () => ({ results: this.db.nextResults.shift() }),
    } as unknown as D1PreparedStatement;
  }
}

class FakeD1Database {
  calls: BoundStatement[] = [];
  nextResults: Array<unknown[] | undefined> = [];

  prepare(sql: string) {
    return new FakeStatement(this, sql) as unknown as D1PreparedStatement;
  }
}

describe("scheduled transactions read-model repository", () => {
  it("searches scheduled transactions with filters and total count", async () => {
    const db = new FakeD1Database();
    db.nextResults.push(
      [
        {
          id: "scheduled-1",
          date_first: "2026-04-01",
          date_next: "2026-05-01",
          frequency: "monthly",
          amount_milliunits: -45000,
          memo: null,
          flag_color: "blue",
          flag_name: "review",
          account_id: "account-1",
          account_name: "Checking",
          payee_id: "payee-1",
          payee_name: "Rent",
          category_id: "category-1",
          category_name: "Housing",
          transfer_account_id: null,
          deleted: 0,
        },
      ],
      [{ count: 2 }],
    );
    const repository = createScheduledTransactionsRepository(
      db as unknown as D1Database,
    );

    await expect(
      repository.listScheduledTransactions({
        accountId: "account-1",
        categoryId: "category-1",
        fromDate: "2026-05-01",
        limit: 1,
        offset: 3,
        payeeId: "payee-1",
        planId: "plan-1",
        toDate: "2026-06-01",
      }),
    ).resolves.toEqual({
      rows: [
        {
          id: "scheduled-1",
          date_first: "2026-04-01",
          date_next: "2026-05-01",
          frequency: "monthly",
          amount_milliunits: -45000,
          memo: null,
          flag_color: "blue",
          flag_name: "review",
          account_id: "account-1",
          account_name: "Checking",
          payee_id: "payee-1",
          payee_name: "Rent",
          category_id: "category-1",
          category_name: "Housing",
          transfer_account_id: null,
          deleted: 0,
        },
      ],
      totalCount: 2,
    });

    expect(db.calls[0]).toMatchObject({
      params: [
        "plan-1",
        "2026-05-01",
        "2026-06-01",
        "account-1",
        "category-1",
        "payee-1",
        1,
        3,
      ],
    });
    expect(db.calls[0]?.sql).toContain("COALESCE(date_next, date_first) >= ?");
    expect(db.calls[0]?.sql).toContain("COALESCE(date_next, date_first) <= ?");
    expect(db.calls[0]?.sql).toContain("account_id = ?");
    expect(db.calls[0]?.sql).toContain("category_id = ?");
    expect(db.calls[0]?.sql).toContain("payee_id = ?");
    expect(db.calls[0]?.sql).toContain("LIMIT ? OFFSET ?");
    expect(db.calls[1]).toMatchObject({
      params: [
        "plan-1",
        "2026-05-01",
        "2026-06-01",
        "account-1",
        "category-1",
        "payee-1",
      ],
    });
    expect(db.calls[1]?.sql).toContain(
      "SELECT COUNT(*) AS count FROM ynab_scheduled_transactions",
    );
  });
});
