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
    const rows = tableName ? this.rows[tableName] : [];

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

    return true;
  }
}

describe("YNAB read-model client", () => {
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
});
