import { describe, expect, it } from "vitest";

import { createInitialPopulationRepository } from "./initial-population-repository.js";

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
}

class FakeD1Database {
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

describe("initial population repository", () => {
  it("upserts supported initial YNAB records into the existing read-model tables", async () => {
    const db = new FakeD1Database();
    const repository = createInitialPopulationRepository(db as unknown as D1Database);
    const syncedAt = "2026-04-28T12:00:00.000Z";

    await repository.upsertUser({
      syncedAt,
      user: {
        id: "user-1",
        name: "Matt"
      }
    });
    await repository.upsertPlans({
      plans: [
        {
          firstMonth: "2026-01-01",
          id: "plan-1",
          lastModifiedOn: "2026-04-28T11:00:00.000Z",
          lastMonth: "2026-04-01",
          name: "Budget"
        }
      ],
      syncedAt
    });
    await repository.upsertPlanSettings({
      planId: "plan-1",
      settings: {
        currencyFormat: {
          currencySymbol: "$",
          decimalDigits: 2,
          displaySymbol: true,
          groupSeparator: ",",
          isoCode: "USD",
          symbolFirst: true
        },
        dateFormat: {
          format: "MM/DD/YYYY"
        }
      },
      syncedAt
    });
    await repository.upsertAccounts({
      accounts: [
        {
          balance: 120000,
          clearedBalance: 110000,
          closed: false,
          directImportInError: false,
          directImportLinked: true,
          deleted: true,
          id: "account-1",
          lastReconciledAt: "2026-04-01T12:00:00.000Z",
          name: "Checking",
          note: "daily account",
          onBudget: true,
          transferPayeeId: "transfer-payee-1",
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
              categoryGroupName: "Everyday",
              deleted: false,
              goalCadence: 1,
              goalCadenceFrequency: 1,
              goalCreationMonth: "2026-01-01",
              goalDay: 15,
              goalMonthsToBudget: 3,
              goalNeedsWholeAmount: true,
              goalOverallFunded: 12000,
              goalOverallLeft: 8000,
              goalPercentageComplete: 60,
              goalSnoozedAt: "2026-04-01T12:00:00.000Z",
              goalTarget: 20000,
              goalTargetDate: "2026-12-01",
              goalTargetMonth: "2026-12-01",
              goalType: "NEED",
              goalUnderFunded: 8000,
              hidden: true,
              id: "category-1",
              name: "Groceries",
              note: "food",
              originalCategoryGroupId: null
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
          ageOfMoney: 14,
          budgeted: 30000,
          categories: [
            {
              activity: -12000,
              balance: 8000,
              budgeted: 20000,
              categoryGroupId: "group-1",
              categoryGroupName: "Everyday",
              deleted: false,
              goalTarget: 20000,
              goalUnderFunded: null,
              hidden: false,
              id: "category-1",
              name: "Groceries",
              note: "monthly food"
            }
          ],
          deleted: false,
          income: 100000,
          month: "2026-04-01",
          toBeBudgeted: 5000
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
          name: "Market",
          transferAccountId: null
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
          accountName: "Checking",
          amount: -45000,
          categoryId: "category-1",
          categoryName: "Rent",
          dateFirst: "2026-04-01",
          dateNext: "2026-05-01",
          deleted: false,
          flagColor: "blue",
          flagName: "Important",
          frequency: "monthly",
          id: "scheduled-1",
          memo: "lease",
          payeeId: "payee-1",
          payeeName: "Landlord",
          subtransactions: [
            {
              amount: -45000,
              categoryId: "category-1",
              deleted: false,
              id: "scheduled-sub-1",
              scheduledTransactionId: "scheduled-1"
            }
          ],
          transferAccountId: null
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
        expect.stringContaining("INSERT INTO ynab_users"),
        expect.stringContaining("INSERT INTO ynab_plans"),
        expect.stringContaining("INSERT INTO ynab_plan_settings"),
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
      expect.arrayContaining(["daily account", 110000, 10000, "transfer-payee-1", 1, 0])
    );
    expect(db.batchStatements.find((statement) => statement.sql.includes("ynab_categories"))?.params).toEqual(
      expect.arrayContaining(["food", "NEED", 20000, "2026-12-01", 1, 15, 1, 1])
    );
    expect(db.batchStatements.find((statement) => statement.sql.includes("ynab_month_categories"))?.params).toEqual(
      expect.arrayContaining(["group-1", "monthly food", 20000])
    );
    expect(db.batchStatements.find((statement) => statement.sql.includes("ynab_scheduled_transactions"))?.params).toEqual(
      expect.arrayContaining(["monthly", "lease", "blue", "Important", "account-1", "payee-1", "category-1"])
    );
    expect(db.batchStatements.find((statement) => statement.sql.includes("ynab_money_movements"))?.params).toEqual(
      expect.arrayContaining(["movement-1", "movement-group-1", "user-1", "category-1", "category-2", 25000])
    );
    expect(db.batchStatements.find((statement) => statement.sql.includes("ynab_money_movement_groups"))?.params).toEqual(
      expect.arrayContaining(["movement-group-1", "2026-04-03T10:00:00Z", "2026-04-01", "rebalance", "user-1"])
    );
    expect(db.batchStatements.find((statement) => statement.sql.includes("ynab_payee_locations"))?.params).toContain(1);
  });

  it("skips D1 batches for empty record sets", async () => {
    const db = new FakeD1Database();
    const repository = createInitialPopulationRepository(db as unknown as D1Database);

    const result = await repository.upsertAccounts({
      accounts: [],
      planId: "plan-1",
      syncedAt: "2026-04-28T12:00:00.000Z"
    });

    expect(result).toEqual({ rowsUpserted: 0 });
    expect(db.batchStatements).toEqual([]);
  });
});
