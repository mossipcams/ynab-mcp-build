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
    readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]) {
    return new FakeStatement(
      this.db,
      this.sql,
      params,
    ) as unknown as D1PreparedStatement;
  }

  all<T>() {
    this.db.allCalls.push({ sql: this.sql, params: this.params });

    return Promise.resolve({
      results: (this.db.allResults.shift() ?? []) as T[],
    } as D1Result<T>);
  }
}

class FakeD1Database {
  allCalls: BoundStatement[] = [];
  allResults: unknown[][] = [];
  batchCalls: BoundStatement[][] = [];
  batchStatements: BoundStatement[] = [];

  prepare(sql: string) {
    return new FakeStatement(this, sql) as unknown as D1PreparedStatement;
  }

  batch(statements: D1PreparedStatement[]) {
    const boundStatements = statements.map((statement) => {
      const fake = statement as unknown as FakeStatement;

      return {
        sql: fake.sql,
        params: fake.params,
      };
    });

    this.batchCalls.push(boundStatements);
    this.batchStatements.push(...boundStatements);

    return Promise.resolve([] as D1Result[]);
  }
}

describe("transactions repository", () => {
  it("upserts changed transactions and keeps deleted rows as tombstones", async () => {
    const db = new FakeD1Database();
    const repository = createTransactionsRepository(
      db as unknown as D1Database,
    );

    const result = await repository.upsertTransactions({
      planId: "plan-1",
      syncedAt: "2026-04-28T12:00:00.000Z",
      transactions: [
        {
          id: "txn-1",
          date: "2026-04-12",
          amount: -12000,
          memo: "weekly run",
          cleared: "cleared",
          approved: true,
          flag_color: "blue",
          flag_name: "follow up",
          account_id: "account-1",
          account_name: "Checking",
          payee_id: "payee-1",
          payee_name: "Market",
          category_id: "category-1",
          category_name: "Groceries",
          transfer_account_id: "account-2",
          transfer_transaction_id: "transfer-txn-1",
          matched_transaction_id: "matched-txn-1",
          import_id: "YNAB:-12000:2026-04-12:1",
          import_payee_name: "MKT",
          import_payee_name_original: "Market Original",
          debt_transaction_type: "payment",
          subtransactions: [
            {
              id: "subtxn-1",
              transaction_id: "txn-1",
              amount: -12000,
              memo: "split line",
              payee_id: "payee-1",
              payee_name: "Market",
              category_id: "category-1",
              category_name: "Groceries",
              transfer_account_id: "account-2",
              transfer_transaction_id: "transfer-subtxn-1",
              deleted: false,
            },
          ],
          deleted: false,
        },
        {
          id: "txn-2",
          date: "2026-04-13",
          amount: -3000,
          deleted: true,
        },
      ],
    });

    expect(result).toEqual({
      rowsDeleted: 1,
      rowsUpserted: 2,
    });
    expect(db.batchStatements).toHaveLength(3);
    const transactionStatement = db.batchStatements[0]!;
    const subtransactionStatement = db.batchStatements[1]!;
    const deletedTransactionStatement = db.batchStatements[2]!;
    expect(transactionStatement.sql).toContain(
      "ON CONFLICT(plan_id, id) DO UPDATE",
    );
    expect(transactionStatement.params).toContain("plan-1");
    expect(transactionStatement.params).toContain("txn-1");
    expect(transactionStatement.params).toContain(-12000);
    expect(transactionStatement.params).toContain("blue");
    expect(transactionStatement.params).toContain("transfer-txn-1");
    expect(transactionStatement.params).toContain("matched-txn-1");
    expect(transactionStatement.params).toContain("YNAB:-12000:2026-04-12:1");
    expect(transactionStatement.params).toContain("payment");
    expect(subtransactionStatement.sql).toContain(
      "INSERT INTO ynab_subtransactions",
    );
    expect(subtransactionStatement.params).toContain("subtxn-1");
    expect(subtransactionStatement.params).toContain("transfer-subtxn-1");
    expect(deletedTransactionStatement.params).toContain(1);
  });

  it("chunks large transaction deltas into bounded D1 batches", async () => {
    const db = new FakeD1Database();
    const repository = createTransactionsRepository(
      db as unknown as D1Database,
    );

    const result = await repository.upsertTransactions({
      planId: "plan-1",
      syncedAt: "2026-04-28T12:00:00.000Z",
      transactions: Array.from({ length: 4_379 }, (_, index) => ({
        amount: -1000,
        date: "2026-04-12",
        deleted: false,
        id: `txn-${index}`,
      })),
    });

    expect(result).toEqual({
      rowsDeleted: 0,
      rowsUpserted: 4_379,
    });
    expect(db.batchCalls.every((batch) => batch.length <= 50)).toBe(true);
    expect(db.batchCalls).toHaveLength(88);
    expect(db.batchCalls.at(-1)).toHaveLength(29);
    expect(db.batchStatements).toHaveLength(4_379);
  });

  it("searches with parameterized filters and excludes deleted transactions by default", async () => {
    const db = new FakeD1Database();
    const rows = [
      {
        amount_milliunits: -12000,
        account_name: "Checking",
        category_name: "Groceries",
        date: "2026-04-12",
        deleted: 0,
        id: "txn-1",
        payee_name: "Market",
      },
    ];
    db.allResults = [[{ count: 42 }], rows];
    const repository = createTransactionsRepository(
      db as unknown as D1Database,
    );

    const result = await repository.searchTransactions({
      accountIds: ["account-1"],
      categoryIds: ["category-1", "category-2"],
      endDate: "2026-04-30",
      limit: 25,
      maxAmountMilliunits: -1000,
      minAmountMilliunits: -20000,
      offset: 50,
      payeeSearch: "market",
      planId: "plan-1",
      startDate: "2026-04-01",
    });

    expect(result).toEqual({
      rows,
      totalCount: 42,
    });
    expect(db.allCalls).toHaveLength(2);
    const countCall = db.allCalls[0]!;
    const rowCall = db.allCalls[1]!;
    expect(countCall.sql).toContain("COUNT(*) AS count");
    expect(countCall.sql).toContain("deleted = 0");
    expect(countCall.params).toEqual([
      "plan-1",
      "2026-04-01",
      "2026-04-30",
      "account-1",
      "category-1",
      "category-2",
      "category-1",
      "category-2",
      "%market%",
      -20000,
      -1000,
    ]);
    expect(rowCall.sql).toContain("deleted = 0");
    expect(rowCall.sql).toContain("account_id IN (?)");
    expect(rowCall.sql).toContain("category_id IN (?, ?)");
    expect(rowCall.sql).toContain("payee_name LIKE ?");
    expect(rowCall.sql).toContain("LIMIT ? OFFSET ?");
    expect(rowCall.params).toEqual([
      "plan-1",
      "2026-04-01",
      "2026-04-30",
      "account-1",
      "category-1",
      "category-2",
      "category-1",
      "category-2",
      "%market%",
      -20000,
      -1000,
      25,
      50,
    ]);
  });

  it("searches by absolute transaction amount when absolute filters are provided", async () => {
    // DEFECT: signed amount filters are surprising for budget users looking for transactions over or under an absolute size.
    const db = new FakeD1Database();
    db.allResults = [[{ count: 0 }], []];
    const repository = createTransactionsRepository(
      db as unknown as D1Database,
    );

    await repository.searchTransactions({
      limit: 25,
      maxAbsAmountMilliunits: 200000,
      minAbsAmountMilliunits: 100000,
      planId: "plan-1",
    });

    expect(db.allCalls[0]?.sql).toContain("ABS(amount_milliunits) >= ?");
    expect(db.allCalls[0]?.sql).toContain("ABS(amount_milliunits) <= ?");
    expect(db.allCalls[0]?.params).toEqual(["plan-1", 100000, 200000]);
  });

  it("matches null transaction categories when filtering by the YNAB Uncategorized category id", async () => {
    // DEFECT: cleanup can report uncategorized transactions that categoryId drilldown cannot retrieve.
    const db = new FakeD1Database();
    db.allResults = [[{ count: 0 }], []];
    const repository = createTransactionsRepository(
      db as unknown as D1Database,
    );

    await repository.searchTransactions({
      categoryIds: ["uncategorized-category-id"],
      limit: 25,
      planId: "plan-1",
    });

    expect(db.allCalls[0]?.sql).toContain("category_id IN (?)");
    expect(db.allCalls[0]?.sql).toContain("category_id IS NULL");
    expect(db.allCalls[0]?.sql).toContain("cat.name = 'Uncategorized'");
    expect(db.allCalls[0]?.params).toEqual([
      "plan-1",
      "uncategorized-category-id",
      "uncategorized-category-id",
    ]);
  });

  it("summarizes all matching transactions without page limits", async () => {
    const db = new FakeD1Database();
    db.allResults = [
      [{ inflow_milliunits: 5000, outflow_milliunits: 12000 }],
      [
        {
          amount_milliunits: 12000,
          category_id: "category-1",
          name: "Groceries",
          transaction_count: 3,
        },
      ],
      [
        {
          amount_milliunits: 9000,
          name: "Market",
          payee_id: "payee-1",
          transaction_count: 2,
        },
      ],
    ];
    const repository = createTransactionsRepository(
      db as unknown as D1Database,
    );

    const result = await repository.summarizeTransactions({
      accountIds: ["account-1"],
      endDate: "2026-04-30",
      includeDeleted: false,
      includeTransfers: false,
      planId: "plan-1",
      startDate: "2026-04-01",
      topN: 5,
    });

    expect(result).toEqual({
      totals: {
        inflowMilliunits: 5000,
        outflowMilliunits: 12000,
      },
      topCategories: [
        {
          amountMilliunits: 12000,
          id: "category-1",
          name: "Groceries",
          transactionCount: 3,
        },
      ],
      topPayees: [
        {
          amountMilliunits: 9000,
          id: "payee-1",
          name: "Market",
          transactionCount: 2,
        },
      ],
    });
    expect(db.allCalls).toHaveLength(3);
    expect(db.allCalls[0]!.sql).not.toContain("LIMIT");
    expect(db.allCalls[1]!.sql).toContain("GROUP BY");
    expect(db.allCalls[1]!.sql).toContain("LIMIT ?");
    expect(db.allCalls[1]!.params).toEqual([
      "plan-1",
      "2026-04-01",
      "2026-04-30",
      "account-1",
      5,
    ]);
  });
});
