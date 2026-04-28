import { describe, expect, it } from "vitest";

import { createTransactionsRepository } from "./transactions-repository.js";

type BoundStatement = {
  sql: string;
  params: unknown[];
};

class FakeStatement {
  constructor(
    private readonly db: FakeD1Database,
    readonly sql: string,
    readonly params: unknown[] = []
  ) {}

  bind(...params: unknown[]) {
    return new FakeStatement(this.db, this.sql, params) as unknown as D1PreparedStatement;
  }

  all<T>() {
    this.db.allCalls.push({ sql: this.sql, params: this.params });

    return Promise.resolve({
      results: this.db.allResults as T[]
    } as D1Result<T>);
  }
}

class FakeD1Database {
  allCalls: BoundStatement[] = [];
  allResults: unknown[] = [];
  batchStatements: BoundStatement[] = [];

  prepare(sql: string) {
    return new FakeStatement(this, sql) as unknown as D1PreparedStatement;
  }

  batch(statements: D1PreparedStatement[]) {
    this.batchStatements.push(
      ...statements.map((statement) => {
        const fake = statement as unknown as FakeStatement;

        return {
          sql: fake.sql,
          params: fake.params
        };
      })
    );

    return Promise.resolve([] as D1Result[]);
  }
}

describe("transactions repository", () => {
  it("upserts changed transactions and keeps deleted rows as tombstones", async () => {
    const db = new FakeD1Database();
    const repository = createTransactionsRepository(db as unknown as D1Database);

    const result = await repository.upsertTransactions({
      planId: "plan-1",
      syncedAt: "2026-04-28T12:00:00.000Z",
      transactions: [
        {
          id: "txn-1",
          date: "2026-04-12",
          amount: -12000,
          memo: "weekly run",
          account_id: "account-1",
          account_name: "Checking",
          payee_id: "payee-1",
          payee_name: "Market",
          category_id: "category-1",
          category_name: "Groceries",
          deleted: false
        },
        {
          id: "txn-2",
          date: "2026-04-13",
          amount: -3000,
          deleted: true
        }
      ]
    });

    expect(result).toEqual({
      rowsDeleted: 1,
      rowsUpserted: 2
    });
    expect(db.batchStatements).toHaveLength(2);
    expect(db.batchStatements[0].sql).toContain("ON CONFLICT(plan_id, id) DO UPDATE");
    expect(db.batchStatements[0].params).toContain("plan-1");
    expect(db.batchStatements[0].params).toContain("txn-1");
    expect(db.batchStatements[0].params).toContain(-12000);
    expect(db.batchStatements[1].params).toContain(1);
  });

  it("searches with parameterized filters and excludes deleted transactions by default", async () => {
    const db = new FakeD1Database();
    db.allResults = [
      {
        id: "txn-1",
        date: "2026-04-12",
        amount_milliunits: -12000,
        payee_name: "Market",
        category_name: "Groceries",
        account_name: "Checking",
        deleted: 0
      }
    ];
    const repository = createTransactionsRepository(db as unknown as D1Database);

    const result = await repository.searchTransactions({
      accountIds: ["account-1"],
      categoryIds: ["category-1", "category-2"],
      endDate: "2026-04-30",
      limit: 25,
      maxAmountMilliunits: -1000,
      minAmountMilliunits: -20000,
      payeeSearch: "market",
      planId: "plan-1",
      startDate: "2026-04-01"
    });

    expect(result).toEqual(db.allResults);
    expect(db.allCalls).toHaveLength(1);
    expect(db.allCalls[0].sql).toContain("deleted = 0");
    expect(db.allCalls[0].sql).toContain("account_id IN (?)");
    expect(db.allCalls[0].sql).toContain("category_id IN (?, ?)");
    expect(db.allCalls[0].sql).toContain("payee_name LIKE ?");
    expect(db.allCalls[0].sql).toContain("LIMIT ?");
    expect(db.allCalls[0].params).toEqual([
      "plan-1",
      "2026-04-01",
      "2026-04-30",
      "account-1",
      "category-1",
      "category-2",
      "%market%",
      -20000,
      -1000,
      25
    ]);
  });
});
