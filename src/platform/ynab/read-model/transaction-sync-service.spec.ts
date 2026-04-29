import { describe, expect, it, vi } from "vitest";

import type { YnabDeltaClient } from "../delta-client.js";
import { createTransactionSyncService } from "./transaction-sync-service.js";

function createSyncStateRepository(
  overrides: Partial<
    Record<keyof ReturnType<typeof baseSyncStateRepository>, unknown>
  > = {},
) {
  return {
    ...baseSyncStateRepository(),
    ...overrides,
  } as ReturnType<typeof baseSyncStateRepository>;
}

function baseSyncStateRepository() {
  return {
    acquireLease: vi.fn(async () => ({
      acquired: true as const,
      leaseExpiresAt: "2026-04-28T12:01:00.000Z",
    })),
    advanceCursor: vi.fn(async () => ({
      advanced: true as const,
    })),
    getServerKnowledge: vi.fn(async () => 123),
    recordFailure: vi.fn(async () => undefined),
  };
}

describe("transaction sync service", () => {
  it("does not call YNAB when another sync lease is active", async () => {
    const deltaClient = {
      listTransactionsDelta: vi.fn(),
    } as unknown as YnabDeltaClient;
    const syncStateRepository = createSyncStateRepository({
      acquireLease: vi.fn(async () => ({
        acquired: false as const,
        reason: "lease_active" as const,
      })),
    });
    const transactionsRepository = {
      upsertTransactions: vi.fn(),
    };
    const service = createTransactionSyncService({
      deltaClient,
      maxRowsPerRun: 100,
      syncStateRepository,
      transactionsRepository,
    });

    const result = await service.syncTransactions({
      leaseOwner: "worker-1",
      now: "2026-04-28T12:00:00.000Z",
      planId: "plan-1",
    });

    expect(result).toEqual({
      status: "skipped",
      reason: "lease_active",
    });
    expect(deltaClient.listTransactionsDelta).not.toHaveBeenCalled();
    expect(transactionsRepository.upsertTransactions).not.toHaveBeenCalled();
  });

  it("upserts changed rows and advances the cursor after writes succeed", async () => {
    const records = [
      {
        id: "txn-1",
        date: "2026-04-12",
        amount: -12000,
        deleted: false,
      },
      {
        id: "txn-2",
        date: "2026-04-13",
        amount: -3000,
        deleted: true,
      },
    ];
    const deltaClient = {
      listTransactionsDelta: vi.fn(async () => ({
        records,
        serverKnowledge: 456,
      })),
    } as unknown as YnabDeltaClient;
    const syncStateRepository = createSyncStateRepository();
    const transactionsRepository = {
      upsertTransactions: vi.fn(async () => ({
        rowsDeleted: 1,
        rowsUpserted: 2,
      })),
    };
    const service = createTransactionSyncService({
      deltaClient,
      maxRowsPerRun: 100,
      syncStateRepository,
      transactionsRepository,
    });

    const result = await service.syncTransactions({
      leaseOwner: "worker-1",
      now: "2026-04-28T12:00:00.000Z",
      planId: "plan-1",
    });

    expect(deltaClient.listTransactionsDelta).toHaveBeenCalledWith(
      "plan-1",
      123,
    );
    expect(transactionsRepository.upsertTransactions).toHaveBeenCalledWith({
      planId: "plan-1",
      syncedAt: "2026-04-28T12:00:00.000Z",
      transactions: records,
    });
    expect(syncStateRepository.advanceCursor).toHaveBeenCalledWith({
      endpoint: "transactions",
      leaseOwner: "worker-1",
      now: "2026-04-28T12:00:00.000Z",
      planId: "plan-1",
      previousServerKnowledge: 123,
      rowsDeleted: 1,
      rowsUpserted: 2,
      serverKnowledge: 456,
    });
    expect(result).toEqual({
      rowsDeleted: 1,
      rowsUpserted: 2,
      serverKnowledge: 456,
      status: "ok",
    });
  });

  it("records failure and does not write rows or advance cursor when delta is too large", async () => {
    const deltaClient = {
      listTransactionsDelta: vi.fn(async () => ({
        records: [
          { id: "txn-1", date: "2026-04-12", amount: -12000 },
          { id: "txn-2", date: "2026-04-13", amount: -3000 },
        ],
        serverKnowledge: 456,
      })),
    } as unknown as YnabDeltaClient;
    const syncStateRepository = createSyncStateRepository();
    const transactionsRepository = {
      upsertTransactions: vi.fn(),
    };
    const service = createTransactionSyncService({
      deltaClient,
      maxRowsPerRun: 1,
      syncStateRepository,
      transactionsRepository,
    });

    const result = await service.syncTransactions({
      leaseOwner: "worker-1",
      now: "2026-04-28T12:00:00.000Z",
      planId: "plan-1",
    });

    expect(transactionsRepository.upsertTransactions).not.toHaveBeenCalled();
    expect(syncStateRepository.advanceCursor).not.toHaveBeenCalled();
    expect(syncStateRepository.recordFailure).toHaveBeenCalledWith({
      endpoint: "transactions",
      error:
        "Delta response contained 2 rows, exceeding the configured limit of 1.",
      leaseOwner: "worker-1",
      now: "2026-04-28T12:00:00.000Z",
      planId: "plan-1",
    });
    expect(result).toEqual({
      reason: "row_limit_exceeded",
      status: "failed",
    });
  });

  it("records failure and does not advance cursor when D1 writes fail", async () => {
    const deltaClient = {
      listTransactionsDelta: vi.fn(async () => ({
        records: [{ id: "txn-1", date: "2026-04-12", amount: -12000 }],
        serverKnowledge: 456,
      })),
    } as unknown as YnabDeltaClient;
    const syncStateRepository = createSyncStateRepository();
    const transactionsRepository = {
      upsertTransactions: vi.fn(async () => {
        throw new Error("D1 write failed");
      }),
    };
    const service = createTransactionSyncService({
      deltaClient,
      maxRowsPerRun: 100,
      syncStateRepository,
      transactionsRepository,
    });

    const result = await service.syncTransactions({
      leaseOwner: "worker-1",
      now: "2026-04-28T12:00:00.000Z",
      planId: "plan-1",
    });

    expect(syncStateRepository.advanceCursor).not.toHaveBeenCalled();
    expect(syncStateRepository.recordFailure).toHaveBeenCalledWith({
      endpoint: "transactions",
      error: "D1 write failed",
      leaseOwner: "worker-1",
      now: "2026-04-28T12:00:00.000Z",
      planId: "plan-1",
    });
    expect(result).toEqual({
      reason: "D1 write failed",
      status: "failed",
    });
  });
});
