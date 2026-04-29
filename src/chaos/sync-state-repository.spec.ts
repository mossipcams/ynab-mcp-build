import { describe, expect, it } from "vitest";

import { createSyncStateRepository } from "../platform/ynab/read-model/sync-state-repository.js";

type LeaseRow = {
  lease_expires_at?: string | null;
  lease_owner?: string | null;
};

class Deferred<T> {
  promise: Promise<T>;
  resolve!: (value: T) => void;

  constructor() {
    this.promise = new Promise((resolve) => {
      this.resolve = resolve;
    });
  }
}

class ContendedLeaseStatement {
  constructor(
    private readonly db: ContendedLeaseD1Database,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]) {
    return new ContendedLeaseStatement(
      this.db,
      this.sql,
      params,
    ) as unknown as D1PreparedStatement;
  }

  first<T>() {
    if (!this.sql.includes("SELECT lease_owner")) {
      return Promise.resolve(null as T | null);
    }

    return this.db.readLease<T>();
  }

  run() {
    return Promise.resolve(this.db.writeLease(this.sql, this.params));
  }
}

class ContendedLeaseD1Database {
  private readonly concurrentReads = 2;
  private readonly waitingReads: Array<Deferred<LeaseRow | null>> = [];
  private lease: LeaseRow | null = null;

  prepare(sql: string) {
    return new ContendedLeaseStatement(
      this,
      sql,
    ) as unknown as D1PreparedStatement;
  }

  readLease<T>() {
    const lease = this.lease;

    if (lease) {
      return Promise.resolve({ ...lease } as T);
    }

    const deferred = new Deferred<LeaseRow | null>();
    this.waitingReads.push(deferred);

    if (this.waitingReads.length === this.concurrentReads) {
      const snapshot = this.lease ? { ...this.lease } : null;

      for (const read of this.waitingReads.splice(0)) {
        read.resolve(snapshot);
      }
    }

    return deferred.promise as Promise<T | null>;
  }

  writeLease(sql: string, params: unknown[]) {
    const owner = String(params[2]);
    const leaseExpiresAt = String(params[3]);
    const now = String(params.at(-1));
    const activeLease =
      this.lease?.lease_owner &&
      this.lease.lease_expires_at &&
      this.lease.lease_expires_at > now;
    const atomicConditionalWrite = sql.includes("lease_expires_at <= ?");

    if (atomicConditionalWrite && activeLease) {
      return {
        meta: { changes: 0 },
        success: true,
      } as D1Result;
    }

    this.lease = {
      lease_expires_at: leaseExpiresAt,
      lease_owner: owner,
    };

    return {
      meta: { changes: 1 },
      success: true,
    } as D1Result;
  }
}

describe("sync state repository chaos", () => {
  it("allows only one concurrent worker to acquire a sync lease", async () => {
    const database = new ContendedLeaseD1Database();
    const repository = createSyncStateRepository(
      database as unknown as D1Database,
    );
    const input = {
      endpoint: "transactions",
      leaseSeconds: 60,
      now: "2026-04-29T12:00:00.000Z",
      planId: "plan-1",
    };

    const results = await Promise.all([
      repository.acquireLease({
        ...input,
        leaseOwner: "worker-1",
      }),
      repository.acquireLease({
        ...input,
        leaseOwner: "worker-2",
      }),
    ]);

    expect(results.filter((result) => result.acquired)).toHaveLength(1);
    expect(results.filter((result) => !result.acquired)).toEqual([
      { acquired: false, reason: "lease_active" },
    ]);
  });
});
