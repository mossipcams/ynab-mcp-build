import { describe, expect, it } from "vitest";

import { createYnabReadModelClient } from "./client.js";

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
    this.db.calls.push({ sql: this.sql, params: this.params });

    return Promise.resolve({
      results: this.db.select(this.sql, this.params) as T[]
    } as D1Result<T>);
  }
}

class FakeD1Database {
  calls: BoundStatement[] = [];
  rows: Record<string, Array<Record<string, unknown>>> = {
    ynab_accounts: [],
    ynab_categories: [],
    ynab_category_groups: [],
    ynab_month_categories: [],
    ynab_months: [],
    ynab_money_movement_groups: [],
    ynab_money_movements: [],
    ynab_payee_locations: [],
    ynab_payees: [],
    ynab_plan_settings: [],
    ynab_plans: [],
    ynab_scheduled_transactions: [],
    ynab_transactions: [],
    ynab_users: []
  };

  prepare(sql: string) {
    return new FakeStatement(this, sql) as unknown as D1PreparedStatement;
  }

  select(sql: string, params: unknown[]) {
    const tableName = Object.keys(this.rows)
      .sort((left, right) => right.length - left.length)
      .find((name) => sql.includes(`FROM ${name}`));
    const rows = tableName ? this.rows[tableName] ?? [] : [];

    if (sql.includes("COUNT(*)")) {
      return [{ count: rows.filter((row) => this.matches(row, sql, params)).length }];
    }

    return rows.filter((row) => this.matches(row, sql, params));
  }

  private matches(row: Record<string, unknown>, sql: string, params: unknown[]) {
    if (sql.includes("plan_id = ?") && row.plan_id !== params[0]) {
      return false;
    }

    if (/(?:^|\s)id = \?/u.test(sql) && !sql.includes("payee_id = ?")) {
      const idParam = params[1] ?? params[0];
      if (row.id !== idParam) {
        return false;
      }
    }

    if (sql.includes("month = ?") && row.month !== params[1]) {
      return false;
    }

    if (sql.includes("account_id = ?") && row.account_id !== params[1]) {
      return false;
    }

    if (sql.includes("category_id = ?") && row.category_id !== params.at(-1)) {
      return false;
    }

    if (sql.includes("payee_id = ?") && row.payee_id !== params.at(-1)) {
      return false;
    }

    if (sql.includes("date >= ?") && typeof row.date === "string" && row.date < String(params[1])) {
      return false;
    }

    if (sql.includes("date <= ?") && typeof row.date === "string" && row.date > String(params.at(-1))) {
      return false;
    }

    return true;
  }
}

describe("YNAB read-model client", () => {
  it("applies both start and end date predicates when listing transactions", async () => {
    const db = new FakeD1Database();
    db.rows.ynab_transactions = [
      {
        plan_id: "plan-1",
        id: "txn-apr",
        date: "2026-04-12",
        amount_milliunits: -12000,
        deleted: 0
      },
      {
        plan_id: "plan-1",
        id: "txn-may",
        date: "2026-05-01",
        amount_milliunits: -9000,
        deleted: 0
      }
    ];
    const client = createYnabReadModelClient(db as unknown as D1Database);

    await expect(client.listTransactions("plan-1", "2026-04-01", "2026-04-30")).resolves.toEqual([
      expect.objectContaining({
        id: "txn-apr"
      })
    ]);

    expect(db.calls[0]).toMatchObject({
      params: ["plan-1", "2026-04-01", "2026-04-30"]
    });
    expect(db.calls[0]?.sql).toContain("date >= ?");
    expect(db.calls[0]?.sql).toContain("date <= ?");
  });

  it("serves core YNAB client reads from D1 rows without HTTP access", async () => {
    const db = new FakeD1Database();
    db.rows.ynab_plans = [
      {
        id: "plan-1",
        name: "Everyday",
        last_modified_on: "2026-04-27T00:00:00Z",
        first_month: "2026-04-01",
        last_month: "2026-05-01",
        deleted: 0
      }
    ];
    db.rows.ynab_accounts = [
      {
        plan_id: "plan-1",
        id: "account-1",
        name: "Checking",
        type: "checking",
        on_budget: 1,
        closed: 0,
        balance_milliunits: 123450,
        deleted: 0
      }
    ];
    db.rows.ynab_category_groups = [
      { plan_id: "plan-1", id: "group-1", name: "Bills", hidden: 0, deleted: 0 }
    ];
    db.rows.ynab_categories = [
      {
        plan_id: "plan-1",
        id: "category-1",
        category_group_id: "group-1",
        category_group_name: "Bills",
        name: "Electric",
        hidden: 0,
        balance_milliunits: 5000,
        goal_target_milliunits: 10000,
        deleted: 0
      }
    ];
    db.rows.ynab_months = [
      {
        plan_id: "plan-1",
        month: "2026-04-01",
        income_milliunits: 500000,
        budgeted_milliunits: 400000,
        activity_milliunits: -250000,
        to_be_budgeted_milliunits: 100000,
        age_of_money: 17,
        deleted: 0
      }
    ];
    db.rows.ynab_month_categories = [
      {
        plan_id: "plan-1",
        month: "2026-04-01",
        category_id: "category-1",
        category_group_name: "Bills",
        name: "Electric",
        budgeted_milliunits: 10000,
        activity_milliunits: -4000,
        balance_milliunits: 6000,
        hidden: 0,
        deleted: 0
      }
    ];
    db.rows.ynab_payees = [
      { plan_id: "plan-1", id: "payee-1", name: "Utility Co", transfer_account_id: null, deleted: 0 }
    ];
    db.rows.ynab_transactions = [
      {
        plan_id: "plan-1",
        id: "txn-1",
        date: "2026-04-12",
        amount_milliunits: -4000,
        payee_id: "payee-1",
        payee_name: "Utility Co",
        category_id: "category-1",
        category_name: "Electric",
        account_id: "account-1",
        account_name: "Checking",
        approved: 1,
        cleared: "cleared",
        deleted: 0
      }
    ];

    const client = createYnabReadModelClient(db as unknown as D1Database, {
      defaultPlanId: "plan-1"
    });

    await expect(client.listPlans()).resolves.toEqual({
      plans: [
        {
          id: "plan-1",
          name: "Everyday",
          lastModifiedOn: "2026-04-27T00:00:00Z"
        }
      ],
      defaultPlan: {
        id: "plan-1",
        name: "Everyday"
      }
    });
    await expect(client.getAccount("plan-1", "account-1")).resolves.toMatchObject({
      id: "account-1",
      balance: 123450,
      onBudget: true
    });
    await expect(client.listCategories("plan-1")).resolves.toEqual([
      {
        id: "group-1",
        name: "Bills",
        hidden: false,
        deleted: false,
        categories: [
          {
            id: "category-1",
            name: "Electric",
            hidden: false,
            deleted: false,
            categoryGroupName: "Bills"
          }
        ]
      }
    ]);
    await expect(client.getPlanMonth("plan-1", "2026-04-01")).resolves.toMatchObject({
      month: "2026-04-01",
      income: 500000,
      categoryCount: 1,
      categories: [
        {
          id: "category-1",
          activity: -4000,
          balance: 6000
        }
      ]
    });
    await expect(client.listTransactionsByPayee("plan-1", "payee-1")).resolves.toMatchObject([
      {
        id: "txn-1",
        amount: -4000,
        payeeName: "Utility Co",
        approved: true
      }
    ]);

    expect(db.calls.map((call) => call.sql).join("\n")).not.toContain("https://api.ynab.com");
  });

  it("maps the full D1-backed client surface with bound plan-scoped queries", async () => {
    const db = new FakeD1Database();
    db.rows.ynab_users = [{ id: "user-1", name: "Avery" }];
    db.rows.ynab_plans = [
      {
        id: "plan-1",
        name: "Everyday",
        last_modified_on: null,
        first_month: "2026-01-01",
        last_month: "2026-04-01",
        deleted: 0
      }
    ];
    db.rows.ynab_accounts = [
      {
        plan_id: "plan-1",
        id: "account-1",
        name: "Checking",
        type: "checking",
        on_budget: null,
        closed: 1,
        balance_milliunits: null,
        deleted: 1
      }
    ];
    db.rows.ynab_categories = [
      {
        plan_id: "plan-1",
        id: "category-1",
        category_group_id: "group-1",
        category_group_name: null,
        name: "Groceries",
        hidden: 1,
        deleted: 0,
        balance_milliunits: null,
        goal_type: "TB",
        goal_target_milliunits: null
      }
    ];
    db.rows.ynab_months = [
      {
        plan_id: "plan-1",
        month: "2026-04-01",
        income_milliunits: null,
        budgeted_milliunits: 111000,
        activity_milliunits: null,
        to_be_budgeted_milliunits: 222000,
        age_of_money: null,
        deleted: 1
      }
    ];
    db.rows.ynab_month_categories = [
      {
        plan_id: "plan-1",
        month: "2026-04-01",
        category_id: "category-1",
        category_group_name: null,
        name: "Groceries",
        budgeted_milliunits: null,
        activity_milliunits: -12000,
        balance_milliunits: null,
        hidden: 1,
        deleted: 1,
        goal_type: "TB",
        goal_target_milliunits: null,
        goal_under_funded_milliunits: 3000
      }
    ];
    db.rows.ynab_plan_settings = [
      {
        plan_id: "plan-1",
        date_format: "YYYY-MM-DD",
        currency_iso_code: "USD",
        currency_example_format: "$1,234.56",
        currency_decimal_digits: 2,
        currency_decimal_separator: ".",
        currency_symbol_first: 1,
        currency_group_separator: ",",
        currency_symbol: "$",
        currency_display_symbol: 0
      }
    ];
    db.rows.ynab_transactions = [
      {
        plan_id: "plan-1",
        id: "txn-old",
        date: "2026-03-31",
        amount_milliunits: -1000,
        account_id: "account-2",
        category_id: "category-2",
        payee_id: "payee-2",
        approved: 0,
        cleared: "uncleared",
        deleted: 1,
        transfer_account_id: "account-3"
      },
      {
        plan_id: "plan-1",
        id: "txn-1",
        date: "2026-04-10",
        amount_milliunits: -2500,
        payee_id: "payee-1",
        payee_name: "Market",
        category_id: "category-1",
        category_name: "Groceries",
        account_id: "account-1",
        account_name: "Checking",
        approved: null,
        cleared: "cleared",
        deleted: 0,
        transfer_account_id: null
      }
    ];
    db.rows.ynab_scheduled_transactions = [
      {
        plan_id: "plan-1",
        id: "sched-1",
        date_first: "2026-04-01",
        date_next: null,
        amount_milliunits: -45000,
        payee_name: null,
        category_name: "Rent",
        account_name: null,
        deleted: 1
      }
    ];
    db.rows.ynab_payees = [
      { plan_id: "plan-1", id: "payee-1", name: "Market", transfer_account_id: "account-9", deleted: 1 }
    ];
    db.rows.ynab_payee_locations = [
      { plan_id: "plan-1", id: "loc-1", payee_id: "payee-1", latitude: 41.1, longitude: -87.2, deleted: 0 }
    ];
    db.rows.ynab_money_movements = [
      {
        plan_id: "plan-1",
        id: "move-1",
        month: "2026-04-01",
        moved_at: "2026-04-15T12:00:00Z",
        note: "rebalance",
        money_movement_group_id: "move-group-1",
        performed_by_user_id: "user-1",
        from_category_id: "category-1",
        to_category_id: "category-2",
        amount_milliunits: 12000,
        deleted: 0
      }
    ];
    db.rows.ynab_money_movement_groups = [
      {
        plan_id: "plan-1",
        id: "move-group-1",
        group_created_at: "2026-04-15T12:00:00Z",
        month: "2026-04-01",
        note: null,
        performed_by_user_id: "user-1",
        deleted: 1
      }
    ];

    const client = createYnabReadModelClient(db as unknown as D1Database, {
      defaultPlanId: "missing-plan"
    });

    await expect(client.getUser()).resolves.toEqual({ id: "user-1", name: "Avery" });
    await expect(client.listPlans()).resolves.toEqual({
      plans: [{ id: "plan-1", name: "Everyday", lastModifiedOn: undefined }],
      defaultPlan: null
    });
    await expect(client.getPlan("plan-1")).resolves.toMatchObject({
      id: "plan-1",
      firstMonth: "2026-01-01",
      lastMonth: "2026-04-01",
      accountCount: 1,
      categoryGroupCount: 0,
      payeeCount: 1
    });
    await expect(client.getCategory("plan-1", "category-1")).resolves.toEqual({
      id: "category-1",
      name: "Groceries",
      hidden: true,
      deleted: false,
      categoryGroupName: undefined,
      balance: undefined,
      goalType: "TB",
      goalTarget: undefined
    });
    await expect(client.getMonthCategory("plan-1", "2026-04-01", "category-1")).resolves.toEqual({
      id: "category-1",
      name: "Groceries",
      hidden: true,
      activity: -12000,
      goalType: "TB",
      goalUnderFunded: 3000
    });
    await expect(client.getPlanSettings("plan-1")).resolves.toEqual({
      dateFormat: { format: "YYYY-MM-DD" },
      currencyFormat: {
        isoCode: "USD",
        exampleFormat: "$1,234.56",
        decimalDigits: 2,
        decimalSeparator: ".",
        symbolFirst: true,
        groupSeparator: ",",
        currencySymbol: "$",
        displaySymbol: false
      }
    });
    await expect(client.listPlanMonths("plan-1")).resolves.toEqual([
      {
        month: "2026-04-01",
        income: undefined,
        budgeted: 111000,
        activity: undefined,
        toBeBudgeted: 222000,
        deleted: true
      }
    ]);
    await expect(client.listAccounts("plan-1")).resolves.toEqual([
      {
        id: "account-1",
        name: "Checking",
        type: "checking",
        closed: true,
        deleted: true,
        balance: 0
      }
    ]);
    await expect(client.getAccount("plan-1", "account-1")).resolves.toEqual({
      id: "account-1",
      name: "Checking",
      type: "checking",
      onBudget: undefined,
      closed: true,
      balance: undefined
    });
    await expect(client.listTransactions("plan-1", "2026-04-01")).resolves.toHaveLength(1);
    await expect(client.listTransactionsByAccount("plan-1", "account-1")).resolves.toMatchObject([
      {
        id: "txn-1",
        approved: null,
        deleted: false,
        isTransfer: false
      }
    ]);
    await expect(client.listTransactionsByCategory("plan-1", "category-1")).resolves.toHaveLength(1);
    await expect(client.getTransaction("plan-1", "txn-1")).resolves.toMatchObject({
      id: "txn-1",
      transferAccountId: null
    });
    await expect(client.listScheduledTransactions("plan-1")).resolves.toEqual([
      {
        id: "sched-1",
        dateFirst: "2026-04-01",
        dateNext: null,
        amount: -45000,
        payeeName: null,
        categoryName: "Rent",
        accountName: null,
        deleted: true
      }
    ]);
    await expect(client.getScheduledTransaction("plan-1", "sched-1")).resolves.toMatchObject({
      id: "sched-1",
      deleted: true
    });
    await expect(client.listPayees("plan-1")).resolves.toEqual([
      {
        id: "payee-1",
        name: "Market",
        transferAccountId: "account-9",
        deleted: true
      }
    ]);
    await expect(client.getPayee("plan-1", "payee-1")).resolves.toMatchObject({
      id: "payee-1",
      transferAccountId: "account-9"
    });
    await expect(client.listPayeeLocations("plan-1")).resolves.toEqual([
      {
        id: "loc-1",
        payeeId: "payee-1",
        latitude: 41.1,
        longitude: -87.2,
        deleted: false
      }
    ]);
    await expect(client.getPayeeLocation("plan-1", "loc-1")).resolves.toMatchObject({
      id: "loc-1",
      latitude: 41.1
    });
    await expect(client.getPayeeLocationsByPayee("plan-1", "payee-1")).resolves.toHaveLength(1);
    await expect(client.listMoneyMovements("plan-1")).resolves.toEqual({
      moneyMovements: [
        {
          amount: 12000,
          deleted: false,
          fromCategoryId: "category-1",
          id: "move-1",
          moneyMovementGroupId: "move-group-1",
          month: "2026-04-01",
          movedAt: "2026-04-15T12:00:00Z",
          note: "rebalance",
          performedByUserId: "user-1",
          toCategoryId: "category-2"
        }
      ],
      serverKnowledge: 0
    });
    await expect(client.listMoneyMovementGroups("plan-1")).resolves.toEqual({
      moneyMovementGroups: [
        {
          deleted: true,
          groupCreatedAt: "2026-04-15T12:00:00Z",
          id: "move-group-1",
          month: "2026-04-01",
          note: null,
          performedByUserId: "user-1"
        }
      ],
      serverKnowledge: 0
    });

    expect(db.calls.map((call) => call.params[0]).filter(Boolean)).toEqual(
      expect.arrayContaining(["plan-1"])
    );
  });

  it("rejects missing detail rows with read-model specific errors", async () => {
    const client = createYnabReadModelClient(new FakeD1Database() as unknown as D1Database);

    await expect(client.getUser()).rejects.toThrow("No synced YNAB user is available.");
    await expect(client.getPlan("missing-plan")).rejects.toThrow("YNAB plan missing-plan was not found");
    await expect(client.getCategory("plan-1", "missing-category")).rejects.toThrow(
      "YNAB category missing-category was not found"
    );
    await expect(client.getMonthCategory("plan-1", "2026-04-01", "missing-category")).rejects.toThrow(
      "YNAB month category missing-category was not found"
    );
    await expect(client.getPlanSettings("plan-1")).rejects.toThrow("YNAB plan settings for plan-1 were not found");
    await expect(client.getPlanMonth("plan-1", "2026-04-01")).rejects.toThrow("YNAB month 2026-04-01 was not found");
    await expect(client.getAccount("plan-1", "missing-account")).rejects.toThrow(
      "YNAB account missing-account was not found"
    );
    await expect(client.getTransaction("plan-1", "missing-transaction")).rejects.toThrow(
      "YNAB transaction missing-transaction was not found"
    );
    await expect(client.getScheduledTransaction("plan-1", "missing-scheduled")).rejects.toThrow(
      "YNAB scheduled transaction missing-scheduled was not found"
    );
    await expect(client.getPayee("plan-1", "missing-payee")).rejects.toThrow("YNAB payee missing-payee was not found");
    await expect(client.getPayeeLocation("plan-1", "missing-location")).rejects.toThrow(
      "YNAB payee location missing-location was not found"
    );
  });
});
