import { describe, expect, it } from "vitest";

import { createSyncStateRepository } from "./sync-state-repository.js";

type BoundStatement = {
  sql: string;
  params: unknown[];
};

class FakeStatement {
  constructor(
    private readonly db: FakeD1Database,
    private readonly sql: string,
    private params: unknown[] = []
  ) {}

  bind(...params: unknown[]) {
    return new FakeStatement(this.db, this.sql, params);
  }

  first<T>() {
    return Promise.resolve(this.db.firstResult as T | null);
  }

  run() {
    this.db.runs.push({ sql: this.sql, params: this.params });

    return Promise.resolve({
      success: true,
      meta: {
        changes: this.db.nextChanges
      }
    } as D1Result);
  }
}

class FakeD1Database {
  firstResult: unknown = null;
  nextChanges = 1;
  runs: BoundStatement[] = [];

  prepare(sql: string) {
    return new FakeStatement(this, sql) as unknown as D1PreparedStatement;
  }
}

describe("sync state repository", () => {
  it("does not acquire a lease that is still active", async () => {
    const db = new FakeD1Database();
    db.firstResult = {
      lease_owner: "other-worker",
      lease_expires_at: "2026-04-28T12:05:00.000Z"
    };
    const repository = createSyncStateRepository(db as unknown as D1Database);

    const result = await repository.acquireLease({
      endpoint: "transactions",
      leaseOwner: "worker-1",
      leaseSeconds: 60,
      now: "2026-04-28T12:00:00.000Z",
      planId: "plan-1"
    });

    expect(result).toEqual({ acquired: false, reason: "lease_active" });
    expect(db.runs).toEqual([]);
  });

  it("acquires an expired lease by writing owner and expiry", async () => {
    const db = new FakeD1Database();
    db.firstResult = {
      lease_owner: "old-worker",
      lease_expires_at: "2026-04-28T11:59:00.000Z"
    };
    const repository = createSyncStateRepository(db as unknown as D1Database);

    const result = await repository.acquireLease({
      endpoint: "transactions",
      leaseOwner: "worker-1",
      leaseSeconds: 60,
      now: "2026-04-28T12:00:00.000Z",
      planId: "plan-1"
    });

    expect(result).toEqual({
      acquired: true,
      leaseExpiresAt: "2026-04-28T12:01:00.000Z"
    });
    expect(db.runs).toHaveLength(1);
    expect(db.runs[0].sql).toContain("ON CONFLICT(plan_id, endpoint) DO UPDATE");
    expect(db.runs[0].params).toContain("worker-1");
    expect(db.runs[0].params).toContain("2026-04-28T12:01:00.000Z");
  });

  it("advances a cursor only for the expected lease owner and previous cursor", async () => {
    const db = new FakeD1Database();
    const repository = createSyncStateRepository(db as unknown as D1Database);

    const result = await repository.advanceCursor({
      endpoint: "transactions",
      leaseOwner: "worker-1",
      now: "2026-04-28T12:02:00.000Z",
      planId: "plan-1",
      previousServerKnowledge: 123,
      rowsDeleted: 1,
      rowsUpserted: 2,
      serverKnowledge: 456
    });

    expect(result).toEqual({ advanced: true });
    expect(db.runs).toHaveLength(1);
    expect(db.runs[0].sql).toContain("server_knowledge = ?");
    expect(db.runs[0].sql).toContain("lease_owner = ?");
    expect(db.runs[0].sql).toContain("server_knowledge = ?");
    expect(db.runs[0].params).toEqual([
      456,
      "2026-04-28T12:02:00.000Z",
      2,
      1,
      "2026-04-28T12:02:00.000Z",
      "plan-1",
      "transactions",
      "worker-1",
      123
    ]);
  });

  it("reports cursor advancement contention when the conditional update changes no rows", async () => {
    const db = new FakeD1Database();
    db.nextChanges = 0;
    const repository = createSyncStateRepository(db as unknown as D1Database);

    const result = await repository.advanceCursor({
      endpoint: "transactions",
      leaseOwner: "worker-1",
      now: "2026-04-28T12:02:00.000Z",
      planId: "plan-1",
      previousServerKnowledge: null,
      rowsDeleted: 0,
      rowsUpserted: 0,
      serverKnowledge: 456
    });

    expect(result).toEqual({ advanced: false, reason: "contention" });
  });
});
