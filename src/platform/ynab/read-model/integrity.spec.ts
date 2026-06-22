import { describe, expect, it } from "vitest";

import { createReadModelIntegrity } from "./integrity.js";

class FakeStatement {
  constructor(
    private readonly db: FakeD1Database,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]) {
    return new FakeStatement(
      this.db,
      this.sql,
      params,
    ) as unknown as D1PreparedStatement;
  }

  all<T>() {
    this.db.calls.push({ sql: this.sql, params: this.params });

    return Promise.resolve({
      results: [{ count: this.db.countFor(this.sql) }],
    } as D1Result<T>);
  }
}

class FakeD1Database {
  calls: Array<{ sql: string; params: unknown[] }> = [];
  counts = new Map<string, number>();

  prepare(sql: string) {
    return new FakeStatement(this, sql) as unknown as D1PreparedStatement;
  }

  countFor(sql: string) {
    for (const [marker, count] of this.counts) {
      if (sql.includes(marker)) {
        return count;
      }
    }

    return 0;
  }
}

describe("read-model integrity diagnostics", () => {
  it("reports month-category gaps and nested reference gaps", async () => {
    const db = new FakeD1Database();
    db.counts.set("FROM ynab_months", 1);
    db.counts.set("FROM ynab_month_categories", 0);
    db.counts.set("FROM ynab_categories", 8);
    db.counts.set("FROM ynab_transactions", 12);
    db.counts.set("FROM ynab_subtransactions", 4);
    db.counts.set("FROM ynab_scheduled_transactions", 3);
    db.counts.set("FROM ynab_scheduled_subtransactions", 2);
    db.counts.set("FROM ynab_money_movements", 5);
    db.counts.set("FROM ynab_money_movement_groups", 0);
    db.counts.set("missing_transaction_category_refs", 2);
    db.counts.set("missing_subtransaction_parent_refs", 1);
    db.counts.set("missing_scheduled_subtransaction_parent_refs", 1);
    db.counts.set("missing_money_movement_group_refs", 5);

    const integrity = createReadModelIntegrity(db as unknown as D1Database);

    await expect(
      integrity.getDiagnostics({
        month: "2026-06-01",
        planId: "plan-1",
      }),
    ).resolves.toMatchObject({
      month: {
        categoryRowCount: 8,
        missingMonthCategoryReferenceCount: 2,
        monthCategoryRowCount: 0,
        monthRowCount: 1,
        transactionCategoryReferenceCount: 12,
      },
      nested: {
        missingMoneyMovementGroupReferenceCount: 5,
        missingScheduledSubtransactionParentReferenceCount: 1,
        missingSubtransactionParentReferenceCount: 1,
        moneyMovementGroupRowCount: 0,
        moneyMovementRowCount: 5,
        scheduledSubtransactionRowCount: 2,
        scheduledTransactionRowCount: 3,
        subtransactionRowCount: 4,
        transactionRowCount: 12,
      },
    });

    expect(db.calls.flatMap((call) => call.params)).toEqual(
      expect.arrayContaining(["plan-1", "2026-06-01"]),
    );
  });

  it("marks a populated month with zero month categories unhealthy", async () => {
    const db = new FakeD1Database();
    db.counts.set("FROM ynab_months", 1);
    db.counts.set("FROM ynab_month_categories", 0);
    db.counts.set("FROM ynab_categories", 8);
    db.counts.set("FROM ynab_transactions", 12);
    const integrity = createReadModelIntegrity(db as unknown as D1Database);

    await expect(
      integrity.getMonthCategoryIntegrity({
        month: "2026-06-01",
        planId: "plan-1",
      }),
    ).resolves.toEqual({
      diagnostics: {
        categoryRowCount: 8,
        missingMonthCategoryReferenceCount: 0,
        monthCategoryRowCount: 0,
        monthRowCount: 1,
        transactionCategoryReferenceCount: 12,
      },
      health_status: "unhealthy",
      warning:
        "Month 2026-06-01 has synced month/category/transaction data but no month-category rows.",
    });
  });
});
