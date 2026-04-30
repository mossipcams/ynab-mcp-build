import { describe, expect, it } from "vitest";

import { createReadModelSyncRepository } from "./read-model-sync-repository.js";

type BoundStatement = {
  sql: string;
  params: unknown[];
};

class FakeStatement {
  constructor(
    readonly sql: string,
    readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]) {
    return new FakeStatement(
      this.sql,
      params,
    ) as unknown as D1PreparedStatement;
  }
}

class FakeD1Database {
  batchCalls: BoundStatement[][] = [];
  batchStatements: BoundStatement[] = [];

  prepare(sql: string) {
    return new FakeStatement(sql) as unknown as D1PreparedStatement;
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

describe("read model sync repository", () => {
  it("upserts budget metadata into the read-model metadata tables", async () => {
    const db = new FakeD1Database();
    const repository = createReadModelSyncRepository(
      db as unknown as D1Database,
    );
    const syncedAt = "2026-04-28T12:00:00.000Z";

    await repository.upsertUser({
      syncedAt,
      user: {
        id: "user-1",
        name: "Avery",
      },
    });
    await repository.upsertPlans({
      plans: [
        {
          id: "plan-1",
          lastModifiedOn: "2026-04-27T10:00:00Z",
          name: "Main Budget",
        },
      ],
      syncedAt,
    });
    await repository.upsertPlanDetail({
      plan: {
        firstMonth: "2026-01-01",
        id: "plan-1",
        lastModifiedOn: "2026-04-27T10:00:00Z",
        lastMonth: "2026-12-01",
        name: "Main Budget",
      },
      syncedAt,
    });
    await repository.upsertPlanSettings({
      planId: "plan-1",
      settings: {
        currencyFormat: {
          currencySymbol: "$",
          decimalDigits: 2,
          decimalSeparator: ".",
          displaySymbol: true,
          exampleFormat: "$1,234.56",
          groupSeparator: ",",
          isoCode: "USD",
          symbolFirst: true,
        },
        dateFormat: {
          format: "MM/DD/YYYY",
        },
      },
      syncedAt,
    });

    expect(db.batchStatements.map((statement) => statement.sql)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("INSERT INTO ynab_users"),
        expect.stringContaining("INSERT INTO ynab_plans"),
        expect.stringContaining("INSERT INTO ynab_plan_settings"),
      ]),
    );
    expect(
      db.batchStatements.every((statement) =>
        statement.sql.includes("ON CONFLICT"),
      ),
    ).toBe(true);
    expect(
      db.batchStatements.find((statement) =>
        statement.sql.includes("ynab_users"),
      )?.params,
    ).toEqual(["user-1", "Avery", syncedAt, syncedAt]);
    expect(
      db.batchStatements.find(
        (statement) =>
          statement.sql.includes("ynab_plans") &&
          statement.params.includes("2026-01-01"),
      )?.params,
    ).toEqual(
      expect.arrayContaining([
        "plan-1",
        "Main Budget",
        "2026-04-27T10:00:00Z",
        "2026-01-01",
        "2026-12-01",
      ]),
    );
    expect(
      db.batchStatements.find((statement) =>
        statement.sql.includes("ynab_plan_settings"),
      )?.params,
    ).toEqual(
      expect.arrayContaining([
        "plan-1",
        "MM/DD/YYYY",
        "USD",
        "$1,234.56",
        2,
        ".",
        1,
        ",",
        "$",
        1,
      ]),
    );
  });

  it("upserts scheduled sync records into the existing read-model tables", async () => {
    const db = new FakeD1Database();
    const repository = createReadModelSyncRepository(
      db as unknown as D1Database,
    );
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
          unclearedBalance: 10000,
        },
      ],
      planId: "plan-1",
      syncedAt,
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
              note: "food",
            },
          ],
          deleted: false,
          hidden: false,
          id: "group-1",
          name: "Everyday",
        },
      ],
      planId: "plan-1",
      syncedAt,
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
              name: "Groceries",
            },
          ],
          deleted: false,
          month: "2026-04-01",
        },
      ],
      planId: "plan-1",
      syncedAt,
    });
    await repository.upsertPayees({
      payees: [
        {
          deleted: false,
          id: "payee-1",
          name: "Market",
        },
      ],
      planId: "plan-1",
      syncedAt,
    });
    await repository.upsertPayeeLocations({
      locations: [
        {
          deleted: true,
          id: "location-1",
          latitude: 41.1,
          longitude: -87.2,
          payeeId: "payee-1",
        },
      ],
      planId: "plan-1",
      syncedAt,
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
              scheduledTransactionId: "scheduled-1",
            },
          ],
        },
      ],
      syncedAt,
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
          toCategoryId: "category-2",
        },
      ],
      planId: "plan-1",
      syncedAt,
    });
    await repository.upsertMoneyMovementGroups({
      moneyMovementGroups: [
        {
          deleted: false,
          groupCreatedAt: "2026-04-03T10:00:00Z",
          id: "movement-group-1",
          month: "2026-04-01",
          note: "rebalance",
          performedByUserId: "user-1",
        },
      ],
      planId: "plan-1",
      syncedAt,
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
        expect.stringContaining("INSERT INTO ynab_money_movement_groups"),
      ]),
    );
    expect(
      db.batchStatements.every((statement) =>
        statement.sql.includes("ON CONFLICT"),
      ),
    ).toBe(true);
    expect(
      db.batchStatements.find((statement) =>
        statement.sql.includes("ynab_accounts"),
      )?.params,
    ).toEqual(expect.arrayContaining(["daily account", 110000, 10000]));
    expect(
      db.batchStatements.find((statement) =>
        statement.sql.includes("ynab_money_movements"),
      )?.params,
    ).toEqual(
      expect.arrayContaining([
        "movement-1",
        "movement-group-1",
        "user-1",
        "category-1",
        "category-2",
        25000,
      ]),
    );
    expect(
      db.batchStatements.find((statement) =>
        statement.sql.includes("ynab_payee_locations"),
      )?.params,
    ).toContain(1);
  });

  it("skips D1 batches for empty record sets", async () => {
    const db = new FakeD1Database();
    const repository = createReadModelSyncRepository(
      db as unknown as D1Database,
    );

    const result = await repository.upsertAccounts({
      accounts: [],
      planId: "plan-1",
      syncedAt: "2026-04-28T12:00:00.000Z",
    });

    expect(result).toEqual({ rowsUpserted: 0 });
    expect(db.batchStatements).toEqual([]);
  });

  it("chunks large D1 writes into bounded batches", async () => {
    const db = new FakeD1Database();
    const repository = createReadModelSyncRepository(
      db as unknown as D1Database,
    );

    await repository.upsertAccounts({
      accounts: Array.from({ length: 125 }, (_, index) => ({
        balance: index,
        closed: false,
        deleted: false,
        id: `account-${index}`,
        name: `Account ${index}`,
        type: "checking",
      })),
      planId: "plan-1",
      syncedAt: "2026-04-28T12:00:00.000Z",
    });

    expect(db.batchCalls).toHaveLength(3);
    expect(db.batchCalls.map((batch) => batch.length)).toEqual([50, 50, 25]);
    expect(db.batchStatements).toHaveLength(125);
  });

  it("chunks large category and month deltas into bounded D1 batches", async () => {
    const db = new FakeD1Database();
    const repository = createReadModelSyncRepository(
      db as unknown as D1Database,
    );
    const categoryCount = 104;
    const categories = Array.from({ length: categoryCount }, (_, index) => ({
      balance: index,
      hidden: false,
      id: `category-${index}`,
      name: `Category ${index}`,
    }));

    const categoryResult = await repository.upsertCategoryGroups({
      categoryGroups: [
        {
          categories,
          deleted: false,
          hidden: false,
          id: "group-1",
          name: "Everyday",
        },
      ],
      planId: "plan-1",
      syncedAt: "2026-04-28T12:00:00.000Z",
    });
    const monthResult = await repository.upsertMonths({
      months: [
        {
          activity: -5000,
          budgeted: 5000,
          categories,
          income: 0,
          month: "2026-04-01",
          toBeBudgeted: 0,
        },
      ],
      planId: "plan-1",
      syncedAt: "2026-04-28T12:00:00.000Z",
    });

    expect(categoryResult).toEqual({
      categoriesUpserted: 104,
      categoryGroupsUpserted: 1,
    });
    expect(monthResult).toEqual({
      monthCategoriesUpserted: 104,
      monthsUpserted: 1,
    });
    expect(db.batchCalls.every((batch) => batch.length <= 50)).toBe(true);
    expect(db.batchCalls.map((batch) => batch.length)).toEqual([
      50, 50, 5, 50, 50, 5,
    ]);
    expect(db.batchStatements).toHaveLength(210);
  });

  it("chunks large payee and money movement deltas into bounded D1 batches", async () => {
    const db = new FakeD1Database();
    const repository = createReadModelSyncRepository(
      db as unknown as D1Database,
    );

    const payeeResult = await repository.upsertPayees({
      payees: Array.from({ length: 539 }, (_, index) => ({
        deleted: false,
        id: `payee-${index}`,
        name: `Payee ${index}`,
      })),
      planId: "plan-1",
      syncedAt: "2026-04-28T12:00:00.000Z",
    });
    const moneyMovementResult = await repository.upsertMoneyMovements({
      moneyMovements: Array.from({ length: 316 }, (_, index) => ({
        amount: 1000,
        deleted: false,
        id: `movement-${index}`,
        month: "2026-04-01",
        movedAt: "2026-04-03T10:00:00Z",
      })),
      planId: "plan-1",
      syncedAt: "2026-04-28T12:00:00.000Z",
    });

    expect(payeeResult).toEqual({ rowsUpserted: 539 });
    expect(moneyMovementResult).toEqual({ rowsUpserted: 316 });
    expect(db.batchCalls.every((batch) => batch.length <= 50)).toBe(true);
    expect(db.batchCalls.map((batch) => batch.length)).toEqual([
      50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 39, 50, 50, 50, 50, 50, 50, 16,
    ]);
    expect(db.batchStatements).toHaveLength(855);
  });
});
