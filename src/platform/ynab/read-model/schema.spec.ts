import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(process.cwd(), "migrations", "0001_ynab_read_model.sql");

function readMigration() {
  return readFileSync(migrationPath, "utf8");
}

describe("YNAB D1 read model schema", () => {
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
      "ynab_money_movement_groups"
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName}`, "u"));
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
      "idx_ynab_categories_plan"
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE INDEX IF NOT EXISTS ${indexName}`, "u"));
    }
  });
});
