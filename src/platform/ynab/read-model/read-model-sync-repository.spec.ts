import { describe, expect, it } from "vitest";

import { createReadModelSyncRepository } from "./read-model-sync-repository.js";

type BoundStatement = {
  sql: string;
  params: unknown[];
};

class FakeStatement {
  constructor(
    readonly sql: string,
    readonly params: unknown[] = []
  ) {}

  bind(...params: unknown[]) {
    return new FakeStatement(this.sql, params) as unknown as D1PreparedStatement;
  }
}

class FakeD1Database {
  batchStatements: BoundStatement[] = [];

  prepare(sql: string) {
    return new FakeStatement(sql) as unknown as D1PreparedStatement;
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

describe("read model sync repository", () => {
  it("upserts scheduled sync records into the existing read-model tables", async () => {
    const db = new FakeD1Database();
    const repository = createReadModelSyncRepository(db as unknown as D1Database);
    const syncedAt = "2026-04-28T12:00:00.000Z";

    await repository.upsertAccounts({
      accounts: [
        {
          balance: 120000,
          clearedBalance: 110000,
          closed: false,
          deleted: false,
          id: "account-1",
          name: "Checking",
          note: "daily account",
          onBudget: true,
          type: "checking",
          unclearedBalance: 10000
        }
      ],
      planId: "plan-1",
      syncedAt
    });
    await repository.upsertCategoryGroups({
      categoryGroups: [
        {
          categories: [
            {
              balance: 8000,
              categoryGroupId: "group-1",
              deleted: false,
              hidden: false,
              id: "category-1",
              name: "Groceries",
              note: "food"
            }
          ],
          deleted: false,
          hidden: false,
          id: "group-1",
          name: "Everyday"
        }
      ],
      planId: "plan-1",
      syncedAt
    });
    await repository.upsertMonths({
      months: [
        {
          activity: -20000,
          categories: [
            {
              activity: -12000,
              balance: 8000,
              budgeted: 20000,
              categoryGroupId: "group-1",
              deleted: false,
              hidden: false,
              id: "category-1",
              name: "Groceries"
            }
          ],
          deleted: false,
          month: "2026-04-01"
        }
      ],
      planId: "plan-1",
      syncedAt
    });
    await repository.upsertPayees({
      payees: [
        {
          deleted: false,
          id: "payee-1",
          name: "Market"
        }
      ],
      planId: "plan-1",
      syncedAt
    });
    await repository.upsertPayeeLocations({
      locations: [
        {
          deleted: true,
          id: "location-1",
          latitude: 41.1,
          longitude: -87.2,
          payeeId: "payee-1"
        }
      ],
      planId: "plan-1",
      syncedAt
    });
    await repository.upsertScheduledTransactions({
      planId: "plan-1",
      scheduledTransactions: [
        {
          accountId: "account-1",
          amount: -45000,
          categoryId: "category-1",
          dateFirst: "2026-04-01",
          deleted: false,
          id: "scheduled-1",
          subtransactions: [
            {
              amount: -45000,
              categoryId: "category-1",
              deleted: false,
              id: "scheduled-sub-1",
              scheduledTransactionId: "scheduled-1"
            }
          ]
        }
      ],
      syncedAt
    });
    await repository.upsertMoneyMovements({
      moneyMovements: [
        {
          amount: 25000,
          deleted: false,
          fromCategoryId: "category-1",
          id: "movement-1",
          moneyMovementGroupId: "movement-group-1",
          month: "2026-04-01",
          movedAt: "2026-04-03T10:00:00Z",
          note: "rebalance",
          performedByUserId: "user-1",
          toCategoryId: "category-2"
        }
      ],
      planId: "plan-1",
      syncedAt
    });
    await repository.upsertMoneyMovementGroups({
      moneyMovementGroups: [
        {
          deleted: false,
          groupCreatedAt: "2026-04-03T10:00:00Z",
          id: "movement-group-1",
          month: "2026-04-01",
          note: "rebalance",
          performedByUserId: "user-1"
        }
      ],
      planId: "plan-1",
      syncedAt
    });

    expect(db.batchStatements.map((statement) => statement.sql)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("INSERT INTO ynab_accounts"),
        expect.stringContaining("INSERT INTO ynab_category_groups"),
        expect.stringContaining("INSERT INTO ynab_categories"),
        expect.stringContaining("INSERT INTO ynab_months"),
        expect.stringContaining("INSERT INTO ynab_month_categories"),
        expect.stringContaining("INSERT INTO ynab_payees"),
        expect.stringContaining("INSERT INTO ynab_payee_locations"),
        expect.stringContaining("INSERT INTO ynab_scheduled_transactions"),
        expect.stringContaining("INSERT INTO ynab_scheduled_subtransactions"),
        expect.stringContaining("INSERT INTO ynab_money_movements"),
        expect.stringContaining("INSERT INTO ynab_money_movement_groups")
      ])
    );
    expect(db.batchStatements.every((statement) => statement.sql.includes("ON CONFLICT"))).toBe(true);
    expect(db.batchStatements.find((statement) => statement.sql.includes("ynab_accounts"))?.params).toEqual(
      expect.arrayContaining(["daily account", 110000, 10000])
    );
    expect(db.batchStatements.find((statement) => statement.sql.includes("ynab_money_movements"))?.params).toEqual(
      expect.arrayContaining(["movement-1", "movement-group-1", "user-1", "category-1", "category-2", 25000])
    );
    expect(db.batchStatements.find((statement) => statement.sql.includes("ynab_payee_locations"))?.params).toContain(1);
  });

  it("skips D1 batches for empty record sets", async () => {
    const db = new FakeD1Database();
    const repository = createReadModelSyncRepository(db as unknown as D1Database);

    const result = await repository.upsertAccounts({
      accounts: [],
      planId: "plan-1",
      syncedAt: "2026-04-28T12:00:00.000Z"
    });

    expect(result).toEqual({ rowsUpserted: 0 });
    expect(db.batchStatements).toEqual([]);
  });
});
