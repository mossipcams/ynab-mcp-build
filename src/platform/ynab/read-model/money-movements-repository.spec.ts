import { describe, expect, it } from "vitest";

import { createMoneyMovementsRepository } from "./money-movements-repository.js";

type BoundStatement = {
  sql: string;
  params: unknown[];
};

class FakeStatement {
  constructor(
    private readonly db: FakeD1Database,
    readonly sql: string,
  ) {}

  bind(...params: unknown[]) {
    this.db.calls.push({ sql: this.sql, params });

    return {
      all: async () => ({ results: this.db.nextResults.shift() }),
    } as unknown as D1PreparedStatement;
  }
}

class FakeD1Database {
  calls: BoundStatement[] = [];
  nextResults: Array<unknown[] | undefined> = [];

  prepare(sql: string) {
    return new FakeStatement(this, sql) as unknown as D1PreparedStatement;
  }
}

describe("money movements read-model repository", () => {
  it("queries money movements with plan and optional month filters", async () => {
    const db = new FakeD1Database();
    db.nextResults.push(
      [
        {
          id: "move-1",
          month: "2026-04-01",
          moved_at: "2026-04-10T00:00:00Z",
          note: "rebalance",
          money_movement_group_id: "group-1",
          performed_by_user_id: "user-1",
          from_category_id: "cat-1",
          from_category_name: "Dining",
          to_category_id: "cat-2",
          to_category_name: "Groceries",
          amount_milliunits: 123000,
          deleted: 0,
        },
      ],
      undefined,
    );
    const repository = createMoneyMovementsRepository(
      db as unknown as D1Database,
    );

    await expect(
      repository.listMoneyMovements({ planId: "plan-1", month: "2026-04-01" }),
    ).resolves.toEqual([
      {
        id: "move-1",
        month: "2026-04-01",
        moved_at: "2026-04-10T00:00:00Z",
        note: "rebalance",
        money_movement_group_id: "group-1",
        performed_by_user_id: "user-1",
        from_category_id: "cat-1",
        from_category_name: "Dining",
        to_category_id: "cat-2",
        to_category_name: "Groceries",
        amount_milliunits: 123000,
        deleted: 0,
      },
    ]);
    await expect(
      repository.listMoneyMovements({ planId: "plan-1" }),
    ).resolves.toEqual([]);

    expect(db.calls[0]).toMatchObject({
      params: ["plan-1", "2026-04-01"],
    });
    expect(db.calls[0]?.sql).toContain(
      "WHERE movement.plan_id = ? AND movement.deleted = 0 AND movement.month = ?",
    );
    expect(db.calls[0]?.sql).toContain("movement.month = ?");
    expect(db.calls[0]?.sql).toContain(
      "LEFT JOIN ynab_categories from_category",
    );
    expect(db.calls[0]?.sql).toContain(
      "ORDER BY movement.moved_at DESC, movement.id",
    );
    expect(db.calls[1]).toMatchObject({
      params: ["plan-1"],
    });
    expect(db.calls[1]?.sql).not.toContain("movement.month = ?");
    expect(db.calls[1]?.sql).toContain(
      "WHERE movement.plan_id = ? AND movement.deleted = 0",
    );
  });

  it("queries movement groups with aggregation and optional month filters", async () => {
    const db = new FakeD1Database();
    db.nextResults.push(
      [
        {
          id: "group-1",
          group_created_at: "2026-04-10T00:00:00Z",
          month: "2026-04-01",
          note: null,
          performed_by_user_id: "user-1",
          movement_count: 2,
          total_amount_milliunits: 456000,
          deleted: 0,
        },
      ],
      undefined,
    );
    const repository = createMoneyMovementsRepository(
      db as unknown as D1Database,
    );

    await expect(
      repository.listMoneyMovementGroups({
        planId: "plan-1",
        month: "2026-04-01",
      }),
    ).resolves.toEqual([
      {
        id: "group-1",
        group_created_at: "2026-04-10T00:00:00Z",
        month: "2026-04-01",
        note: null,
        performed_by_user_id: "user-1",
        movement_count: 2,
        total_amount_milliunits: 456000,
        deleted: 0,
      },
    ]);
    await expect(
      repository.listMoneyMovementGroups({ planId: "plan-1" }),
    ).resolves.toEqual([]);

    expect(db.calls[0]).toMatchObject({
      params: ["plan-1", "2026-04-01"],
    });
    expect(db.calls[0]?.sql).toContain(
      "WHERE movement.plan_id = ? AND movement.deleted = 0 AND movement.month = ?",
    );
    expect(db.calls[0]?.sql).toContain("movement.month = ?");
    expect(db.calls[0]?.sql).toContain("COUNT(movement.id) AS movement_count");
    expect(db.calls[0]?.sql).toContain(
      "COALESCE(SUM(movement.amount_milliunits), 0)",
    );
    expect(db.calls[0]?.sql).toContain(
      "GROUP BY movement.plan_id, COALESCE(movement.money_movement_group_id, movement.id)",
    );
    expect(db.calls[1]).toMatchObject({
      params: ["plan-1"],
    });
    expect(db.calls[1]?.sql).not.toContain("movement.month = ?");
    expect(db.calls[1]?.sql).toContain(
      "WHERE movement.plan_id = ? AND movement.deleted = 0",
    );
  });

  it("derives movement groups from movement rows and applies month ranges in SQL", async () => {
    // DEFECT: grouped movement searches can return no rows when movement group metadata is absent even though movements are synced.
    const db = new FakeD1Database();
    db.nextResults.push([
      {
        id: "group-1",
        group_created_at: "2026-04-10T00:00:00Z",
        month: "2026-04-01",
        note: null,
        performed_by_user_id: "user-1",
        movement_count: 2,
        total_amount_milliunits: 456000,
        deleted: 0,
      },
    ]);
    const repository = createMoneyMovementsRepository(
      db as unknown as D1Database,
    );

    await expect(
      repository.listMoneyMovementGroups({
        fromMonth: "2026-03-01",
        planId: "plan-1",
        toMonth: "2026-04-01",
      }),
    ).resolves.toEqual([
      {
        id: "group-1",
        group_created_at: "2026-04-10T00:00:00Z",
        month: "2026-04-01",
        note: null,
        performed_by_user_id: "user-1",
        movement_count: 2,
        total_amount_milliunits: 456000,
        deleted: 0,
      },
    ]);

    expect(db.calls[0]).toMatchObject({
      params: ["plan-1", "2026-03-01", "2026-04-01"],
    });
    expect(db.calls[0]?.sql).toContain("FROM ynab_money_movements movement");
    expect(db.calls[0]?.sql).toContain("movement.month >= ?");
    expect(db.calls[0]?.sql).toContain("movement.month <= ?");
    expect(db.calls[0]?.sql).toContain(
      "COALESCE(movement.money_movement_group_id, movement.id)",
    );
  });
});
