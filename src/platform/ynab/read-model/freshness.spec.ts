import { describe, expect, it } from "vitest";

import { createReadModelFreshness } from "./freshness.js";

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

    if (this.sql.includes("FROM ynab_sync_state")) {
      return Promise.resolve({
        results: this.params.slice(1).map((endpoint) => ({
          endpoint,
          health_status: "ok",
          last_successful_sync_at: "2026-06-15T12:00:00.000Z",
        })),
      } as D1Result<T>);
    }

    return Promise.resolve({
      results: [{ count: this.db.countFor(this.sql) }],
    } as D1Result<T>);
  }
}

class FakeD1Database {
  calls: Array<{ sql: string; params: unknown[] }> = [];
  monthCategoryCount = 1;

  prepare(sql: string) {
    return new FakeStatement(this, sql) as unknown as D1PreparedStatement;
  }

  countFor(sql: string) {
    if (sql.includes("FROM ynab_month_categories")) {
      return this.monthCategoryCount;
    }

    return 1;
  }

  integrityMonths() {
    return this.calls
      .filter((call) => call.sql.includes("FROM ynab_month_categories"))
      .flatMap((call) => call.params.slice(1, 2));
  }
}

function createFreshness(db: FakeD1Database) {
  return createReadModelFreshness(db as unknown as D1Database, {
    now: () => "2026-06-15T12:30:00.000Z",
    staleAfterMinutes: 360,
  });
}

describe("read-model freshness month integrity context", () => {
  it("checks the current calendar month when no month input is given", async () => {
    const db = new FakeD1Database();
    db.monthCategoryCount = 0;

    await expect(
      createFreshness(db).getFreshness("plan-1", ["categories", "months"], {}),
    ).resolves.toMatchObject({
      health_status: "unhealthy",
      warning:
        "Month 2026-06-01 has synced month/category/transaction data but no month-category rows.",
    });

    expect(db.integrityMonths()).toContain("2026-06-01");
  });

  it("resolves the 'current' month selector to the current calendar month", async () => {
    const db = new FakeD1Database();
    db.monthCategoryCount = 0;

    await expect(
      createFreshness(db).getFreshness("plan-1", ["categories", "months"], {
        month: "current",
      }),
    ).resolves.toMatchObject({
      health_status: "unhealthy",
    });

    expect(db.integrityMonths()).toContain("2026-06-01");
  });

  it("normalizes an explicit month date to the first of that month", async () => {
    const db = new FakeD1Database();
    db.monthCategoryCount = 0;

    await createFreshness(db).getFreshness("plan-1", ["categories", "months"], {
      month: "2026-04-17",
    });

    expect(db.integrityMonths()).toContain("2026-04-01");
  });

  it("skips the month integrity check when months are not required", async () => {
    const db = new FakeD1Database();
    db.monthCategoryCount = 0;

    await expect(
      createFreshness(db).getFreshness("plan-1", ["categories"], {}),
    ).resolves.toMatchObject({ health_status: "ok" });

    expect(db.integrityMonths()).toEqual([]);
  });
});
