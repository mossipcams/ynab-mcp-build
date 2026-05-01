import { describe, expect, it } from "vitest";

import { createSyncRunRepository } from "./sync-run-repository.js";

type BoundStatement = {
  sql: string;
  params: unknown[];
};

class FakeStatement {
  constructor(
    private readonly db: FakeD1Database,
    private readonly sql: string,
    private params: unknown[] = [],
  ) {}

  bind(...params: unknown[]) {
    return new FakeStatement(this.db, this.sql, params);
  }

  run() {
    this.db.runs.push({ sql: this.sql, params: this.params });

    return Promise.resolve({
      success: true,
      meta: { changes: 1 },
    } as D1Result);
  }
}

class FakeD1Database {
  runs: BoundStatement[] = [];

  prepare(sql: string) {
    return new FakeStatement(this, sql) as unknown as D1PreparedStatement;
  }
}

describe("sync run repository", () => {
  it("records endpoint run start and finish rows", async () => {
    const db = new FakeD1Database();
    const repository = createSyncRunRepository(db as unknown as D1Database);

    await repository.startEndpointRun({
      endpoint: "transactions",
      id: "scheduled:123:transactions",
      planId: "plan-1",
      serverKnowledgeBefore: 12,
      startedAt: "2026-04-29T12:00:00.000Z",
    });
    await repository.finishEndpointRun({
      error: null,
      finishedAt: "2026-04-29T12:00:03.000Z",
      id: "scheduled:123:transactions",
      rowsDeleted: 1,
      rowsUpserted: 2,
      serverKnowledgeAfter: 13,
      status: "ok",
    });

    expect(db.runs).toHaveLength(2);
    expect(db.runs[0]).toEqual({
      params: [
        "scheduled:123:transactions",
        "plan-1",
        "transactions",
        "2026-04-29T12:00:00.000Z",
        "running",
        12,
      ],
      sql: expect.stringContaining("INSERT INTO ynab_sync_runs"),
    });
    expect(db.runs[1]).toEqual({
      params: [
        "2026-04-29T12:00:03.000Z",
        "ok",
        13,
        2,
        1,
        null,
        "scheduled:123:transactions",
      ],
      sql: expect.stringContaining("UPDATE ynab_sync_runs"),
    });
  });
});
