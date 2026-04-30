import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { YNAB_READ_MODEL_TABLES } from "./schema.js";

const migrationPath = join(
  process.cwd(),
  "migrations",
  "0001_ynab_read_model.sql",
);

function readMigration() {
  return readFileSync(migrationPath, "utf8");
}

function tableSql(sql: string, tableName: string) {
  const match = new RegExp(
    `CREATE TABLE IF NOT EXISTS ${tableName} \\((?<body>[\\s\\S]*?)\\n\\);`,
    "u",
  ).exec(sql);

  expect(match, `${tableName} table should exist`).not.toBeNull();
  return match?.groups?.body ?? "";
}

function expectColumns(sql: string, tableName: string, columnNames: string[]) {
  const body = tableSql(sql, tableName);

  for (const columnName of columnNames) {
    expect(body, `${tableName} should include ${columnName}`).toMatch(
      new RegExp(`\\b${columnName}\\b`, "u"),
    );
  }
}

describe("YNAB D1 read model schema", () => {
  it("keeps a TypeScript table contract aligned with the migration", () => {
    const sql = readMigration();

    for (const table of Object.values(YNAB_READ_MODEL_TABLES)) {
      const body = tableSql(sql, table.name);

      for (const column of table.columns) {
        expect(body, `${table.name} should include ${column}`).toMatch(
          new RegExp(`\\b${column}\\b`, "u"),
        );
      }
    }
  });

  it("creates sync coordination tables for endpoint cursors and bounded runs", () => {
    const sql = readMigration();

    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS ynab_sync_state/u);
    expect(sql).toMatch(/PRIMARY KEY \(plan_id, endpoint\)/u);
    expect(sql).toContain("server_knowledge INTEGER");
    expect(sql).toContain("lease_owner TEXT");
    expect(sql).toContain("lease_expires_at TEXT");
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS ynab_sync_runs/u);
    expect(sql).toContain("server_knowledge_before INTEGER");
    expect(sql).toContain("server_knowledge_after INTEGER");
  });

  it("creates normalized read-model tables needed by DB-backed MCP tools", () => {
    const sql = readMigration();

    for (const tableName of [
      "ynab_users",
      "ynab_plans",
      "ynab_plan_settings",
      "ynab_accounts",
      "ynab_category_groups",
      "ynab_categories",
      "ynab_months",
      "ynab_month_categories",
      "ynab_payees",
      "ynab_payee_locations",
      "ynab_transactions",
      "ynab_subtransactions",
      "ynab_scheduled_transactions",
      "ynab_scheduled_subtransactions",
      "ynab_money_movements",
      "ynab_money_movement_groups",
    ]) {
      expect(sql).toMatch(
        new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName}`, "u"),
      );
    }
  });

  it("stores money as integer milliunits and keeps deleted flags in synced tables", () => {
    const sql = readMigration();

    expect(sql).toContain("amount_milliunits INTEGER");
    expect(sql).toContain("balance_milliunits INTEGER");
    expect(sql).toContain("activity_milliunits INTEGER");
    expect(sql).toContain("deleted INTEGER NOT NULL DEFAULT 0");
  });

  it("indexes common DB-backed query paths", () => {
    const sql = readMigration();

    for (const indexName of [
      "idx_ynab_transactions_plan_date",
      "idx_ynab_transactions_account_date",
      "idx_ynab_transactions_category_date",
      "idx_ynab_transactions_payee_date",
      "idx_ynab_month_categories_plan_month_category",
      "idx_ynab_payees_plan_name",
      "idx_ynab_accounts_plan",
      "idx_ynab_categories_plan",
    ]) {
      expect(sql).toMatch(
        new RegExp(`CREATE INDEX IF NOT EXISTS ${indexName}`, "u"),
      );
    }
  });

  it("keeps API-backed account fields needed for DB-backed read tools", () => {
    const sql = readMigration();

    expectColumns(sql, "ynab_accounts", [
      "note",
      "cleared_balance_milliunits",
      "uncleared_balance_milliunits",
      "transfer_payee_id",
      "direct_import_linked",
      "direct_import_in_error",
      "last_reconciled_at",
    ]);
  });

  it("keeps API-backed category and month fields needed for DB-backed read tools", () => {
    const sql = readMigration();

    expectColumns(sql, "ynab_categories", [
      "original_category_group_id",
      "note",
      "goal_day",
      "goal_cadence",
      "goal_cadence_frequency",
      "goal_creation_month",
      "goal_percentage_complete",
      "goal_months_to_budget",
      "goal_under_funded_milliunits",
      "goal_overall_funded_milliunits",
      "goal_overall_left_milliunits",
    ]);
    expectColumns(sql, "ynab_months", ["note"]);
    expectColumns(sql, "ynab_month_categories", [
      "original_category_group_id",
      "note",
      "goal_day",
      "goal_cadence",
      "goal_cadence_frequency",
      "goal_creation_month",
      "goal_percentage_complete",
      "goal_months_to_budget",
      "goal_overall_funded_milliunits",
      "goal_overall_left_milliunits",
    ]);
  });

  it("keeps API-backed transaction fields needed for DB-backed read tools", () => {
    const sql = readMigration();

    expectColumns(sql, "ynab_transactions", [
      "flag_color",
      "transfer_transaction_id",
      "matched_transaction_id",
      "import_id",
      "import_payee_name",
      "import_payee_name_original",
      "debt_transaction_type",
    ]);
    expectColumns(sql, "ynab_subtransactions", ["transfer_transaction_id"]);
  });

  it("keeps API-backed scheduled transaction fields needed for DB-backed read tools", () => {
    const sql = readMigration();

    expectColumns(sql, "ynab_scheduled_transactions", [
      "flag_color",
      "flag_name",
    ]);
  });

  it("models money movements as category movements from the YNAB API", () => {
    const sql = readMigration();

    expectColumns(sql, "ynab_money_movements", [
      "month",
      "moved_at",
      "note",
      "money_movement_group_id",
      "performed_by_user_id",
      "from_category_id",
      "to_category_id",
      "amount_milliunits",
    ]);
    expectColumns(sql, "ynab_money_movement_groups", [
      "group_created_at",
      "month",
      "note",
      "performed_by_user_id",
    ]);
  });
});
