import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { createYnabReadModelClient } from "./client.js";
import { createScheduledTransactionsRepository } from "./scheduled-transactions-repository.js";
import { createTransactionsRepository } from "./transactions-repository.js";

// Runs the real read-path SQL against SQLite with the production migration, so
// money assertions check query semantics rather than SQL substrings.
function createSqliteD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(
      new URL(
        "../../../../migrations/0001_ynab_read_model.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );

  const statement = (sql: string, params: SQLInputValue[] = []) => ({
    bind: (...next: SQLInputValue[]) => statement(sql, next),
    all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
  });
  // Only the D1 surface the read path uses is implemented.
  const database = {
    prepare: (sql: string) => statement(sql),
  } as unknown as D1Database;

  function insert(table: string, row: Record<string, SQLInputValue>) {
    const values = {
      plan_id: "plan-1",
      deleted: 0,
      synced_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-10-01T00:00:00.000Z",
      ...row,
    };
    const columns = Object.keys(values);
    sqlite
      .prepare(
        `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
      )
      .run(...Object.values(values));
  }

  return { database, insert };
}

function seedCostcoSplit(insert: ReturnType<typeof createSqliteD1>["insert"]) {
  insert("ynab_transactions", {
    id: "costco",
    date: "2026-10-05",
    amount_milliunits: -500000,
    payee_id: "payee-costco",
    payee_name: "Costco",
    category_name: "Split",
  });
  insert("ynab_subtransactions", {
    transaction_id: "costco",
    id: "costco-groceries",
    amount_milliunits: -50000,
    category_id: "groceries",
    category_name: "Groceries",
  });
  insert("ynab_subtransactions", {
    transaction_id: "costco",
    id: "costco-electronics",
    amount_milliunits: -450000,
    category_id: "electronics",
    category_name: "Electronics",
    payee_id: "payee-bestbuy",
    payee_name: "Best Buy",
  });
  insert("ynab_subtransactions", {
    transaction_id: "costco",
    id: "costco-removed",
    amount_milliunits: -100000,
    category_id: "groceries",
    category_name: "Groceries",
    deleted: 1,
  });
}

describe("read path money accuracy (real SQLite)", () => {
  it("never returns deleted split lines from the read-model client", async () => {
    const { database, insert } = createSqliteD1();
    seedCostcoSplit(insert);
    const client = createYnabReadModelClient(database);

    const transaction = await client.getTransaction("plan-1", "costco");
    const listed = await client.listTransactions("plan-1");

    for (const subtransactions of [
      transaction.subtransactions,
      listed[0]?.subtransactions,
    ]) {
      expect(subtransactions?.map((line) => line.id)).toEqual([
        "costco-electronics",
        "costco-groceries",
      ]);
      expect(subtransactions?.reduce((sum, line) => sum + line.amount, 0)).toBe(
        transaction.amount,
      );
    }
  });

  it("omits deleted month categories like the live month detail", async () => {
    const { database, insert } = createSqliteD1();
    insert("ynab_months", { month: "2026-10-01" });
    insert("ynab_month_categories", {
      month: "2026-10-01",
      category_id: "live",
      name: "Live",
      budgeted_milliunits: 500000,
    });
    insert("ynab_month_categories", {
      month: "2026-10-01",
      category_id: "gone",
      name: "Gone",
      budgeted_milliunits: 500000,
      deleted: 1,
    });
    const client = createYnabReadModelClient(database);

    const month = await client.getPlanMonth("plan-1", "2026-10-01");

    expect(month.categoryCount).toBe(1);
    expect(month.categories?.map((category) => category.id)).toEqual(["live"]);
    await expect(
      client.getMonthCategory("plan-1", "2026-10-01", "gone"),
    ).rejects.toThrow("gone was not found");
  });

  it("reports only the matched category share of a split in search rows", async () => {
    const { database, insert } = createSqliteD1();
    seedCostcoSplit(insert);
    const repository = createTransactionsRepository(database);

    const page = await repository.searchTransactions({
      categoryIds: ["groceries"],
      limit: 25,
      planId: "plan-1",
    });

    expect(page.totalCount).toBe(1);
    expect(page.rows[0]).toMatchObject({
      id: "costco",
      amount_milliunits: -50000,
      transaction_amount_milliunits: -500000,
    });
  });

  it("matches payee filters against split line payees and scopes totals to them", async () => {
    const { database, insert } = createSqliteD1();
    seedCostcoSplit(insert);
    const repository = createTransactionsRepository(database);

    const page = await repository.searchTransactions({
      limit: 25,
      payeeIds: ["payee-bestbuy"],
      planId: "plan-1",
    });
    const summary = await repository.summarizeTransactions({
      payeeIds: ["payee-bestbuy"],
      planId: "plan-1",
    });

    expect(page.rows[0]).toMatchObject({
      id: "costco",
      amount_milliunits: -450000,
    });
    expect(summary.totals.outflowMilliunits).toBe(450000);
  });

  it("counts transfers to tracking accounts but not budget-to-budget transfers", async () => {
    const { database, insert } = createSqliteD1();
    for (const [id, type, onBudget] of [
      ["checking", "checking", 1],
      ["savings", "savings", 1],
      ["credit-card", "creditCard", 1],
      ["loan-account", "mortgage", 0],
    ] as const) {
      insert("ynab_accounts", { id, name: id, type, on_budget: onBudget });
    }
    insert("ynab_transactions", {
      id: "mortgage",
      date: "2026-10-01",
      amount_milliunits: -2400000,
      category_id: "mortgage",
      category_name: "Mortgage",
      transfer_account_id: "loan-account",
    });
    insert("ynab_transactions", {
      id: "loan-side",
      date: "2026-10-01",
      amount_milliunits: 2400000,
      transfer_account_id: "checking",
    });
    insert("ynab_transactions", {
      id: "card-payment",
      date: "2026-10-02",
      amount_milliunits: -900000,
      transfer_account_id: "credit-card",
    });
    insert("ynab_transactions", {
      id: "paycheck",
      date: "2026-10-03",
      amount_milliunits: 3000000,
      category_name: "Split",
    });
    insert("ynab_subtransactions", {
      transaction_id: "paycheck",
      id: "paycheck-rta",
      amount_milliunits: 2500000,
      category_id: "rta",
      category_name: "Inflow: Ready to Assign",
    });
    insert("ynab_subtransactions", {
      transaction_id: "paycheck",
      id: "paycheck-savings",
      amount_milliunits: 500000,
      transfer_account_id: "savings",
    });
    const repository = createTransactionsRepository(database);

    const page = await repository.searchTransactions({
      limit: 25,
      planId: "plan-1",
    });
    const summary = await repository.summarizeTransactions({
      planId: "plan-1",
    });

    expect(page.rows.map((row) => row.id).sort()).toEqual([
      "mortgage",
      "paycheck",
    ]);
    expect(summary.totals).toEqual({
      inflowMilliunits: 2500000,
      outflowMilliunits: 2400000,
    });
  });

  it("matches scheduled split lines by category and reports their share", async () => {
    const { database, insert } = createSqliteD1();
    insert("ynab_scheduled_transactions", {
      id: "housing",
      date_first: "2026-01-01",
      date_next: "2026-11-01",
      frequency: "monthly",
      amount_milliunits: -2000000,
      category_name: "Split",
    });
    insert("ynab_scheduled_subtransactions", {
      scheduled_transaction_id: "housing",
      id: "housing-rent",
      amount_milliunits: -1500000,
      category_id: "rent",
    });
    insert("ynab_scheduled_subtransactions", {
      scheduled_transaction_id: "housing",
      id: "housing-utilities",
      amount_milliunits: -500000,
      category_id: "utilities",
    });
    insert("ynab_scheduled_subtransactions", {
      scheduled_transaction_id: "housing",
      id: "housing-removed",
      amount_milliunits: -300000,
      category_id: "utilities",
      deleted: 1,
    });
    const repository = createScheduledTransactionsRepository(database);

    const result = await repository.listScheduledTransactions({
      categoryId: "utilities",
      planId: "plan-1",
    });

    expect(result.totalCount).toBe(1);
    expect(result.rows[0]).toMatchObject({
      id: "housing",
      amount_milliunits: -500000,
      transaction_amount_milliunits: -2000000,
    });
  });
});
