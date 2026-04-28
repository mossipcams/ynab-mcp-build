import { describe, expect, it, vi } from "vitest";

import type { YnabDeltaClient } from "../delta-client.js";
import { createReadModelSyncService } from "./read-model-sync-service.js";

function createSyncStateRepository() {
  return {
    acquireLease: vi.fn(async () => ({
      acquired: true as const,
      leaseExpiresAt: "2026-04-28T12:01:00.000Z"
    })),
    advanceCursor: vi.fn(async () => ({
      advanced: true as const
    })),
    getServerKnowledge: vi.fn(async (_planId: string, endpoint: string) => ({
      accounts: 101,
      categories: 102,
      months: 103,
      payees: 104,
      payee_locations: 105,
      scheduled_transactions: 106,
      transactions: 107
    })[endpoint] ?? null),
    recordFailure: vi.fn(async () => undefined)
  };
}

describe("read-model sync service", () => {
  it("syncs every cursor-backed endpoint through its own lease and cursor", async () => {
    const deltaClient = {
      listAccountsDelta: vi.fn(async () => ({ records: [{ id: "account-1" }], serverKnowledge: 201 })),
      listCategoriesDelta: vi.fn(async () => ({ records: [{ id: "group-1", categories: [{ id: "category-1" }] }], serverKnowledge: 202 })),
      listMonthsDelta: vi.fn(async () => ({ records: [{ month: "2026-04-01", categories: [{ id: "category-1" }] }], serverKnowledge: 203 })),
      listPayeesDelta: vi.fn(async () => ({ records: [{ id: "payee-1" }], serverKnowledge: 204 })),
      listPayeeLocationsDelta: vi.fn(async () => ({ records: [{ id: "location-1" }], serverKnowledge: 205 })),
      listScheduledTransactionsDelta: vi.fn(async () => ({ records: [{ id: "scheduled-1" }], serverKnowledge: 206 })),
      listTransactionsDelta: vi.fn(async () => ({ records: [{ id: "txn-1", amount: -12000, date: "2026-04-12" }], serverKnowledge: 207 }))
    } as unknown as YnabDeltaClient;
    const syncStateRepository = createSyncStateRepository();
    const readModelRepository = {
      upsertAccounts: vi.fn(async () => ({ rowsUpserted: 1 })),
      upsertCategoryGroups: vi.fn(async () => ({ categoriesUpserted: 1, categoryGroupsUpserted: 1 })),
      upsertMonths: vi.fn(async () => ({ monthCategoriesUpserted: 1, monthsUpserted: 1 })),
      upsertMoneyMovementGroups: vi.fn(async () => ({ rowsUpserted: 1 })),
      upsertMoneyMovements: vi.fn(async () => ({ rowsUpserted: 1 })),
      upsertPayees: vi.fn(async () => ({ rowsUpserted: 1 })),
      upsertPayeeLocations: vi.fn(async () => ({ rowsUpserted: 1 })),
      upsertScheduledTransactions: vi.fn(async () => ({ rowsUpserted: 1 }))
    };
    const transactionsRepository = {
      upsertTransactions: vi.fn(async () => ({ rowsDeleted: 0, rowsUpserted: 1 }))
    };
    const moneyMovementClient = {
      listMoneyMovementGroups: vi.fn(async () => ({
        moneyMovementGroups: [{ groupCreatedAt: "2026-04-28T12:00:00.000Z", id: "movement-group-1", month: "2026-04-01" }],
        serverKnowledge: 208
      })),
      listMoneyMovements: vi.fn(async () => ({
        moneyMovements: [{ amount: 12000, id: "movement-1" }],
        serverKnowledge: 209
      }))
    };
    const service = createReadModelSyncService({
      deltaClient,
      maxRowsPerRun: 100,
      moneyMovementClient,
      readModelRepository,
      syncStateRepository,
      transactionsRepository
    });

    const result = await service.syncReadModel({
      leaseOwner: "cron:123",
      now: "2026-04-28T12:00:00.000Z",
      planId: "plan-1"
    });

    expect(deltaClient.listAccountsDelta).toHaveBeenCalledWith("plan-1", 101);
    expect(deltaClient.listCategoriesDelta).toHaveBeenCalledWith("plan-1", 102);
    expect(deltaClient.listMonthsDelta).toHaveBeenCalledWith("plan-1", 103);
    expect(deltaClient.listPayeesDelta).toHaveBeenCalledWith("plan-1", 104);
    expect(deltaClient.listPayeeLocationsDelta).toHaveBeenCalledWith("plan-1", 105);
    expect(deltaClient.listScheduledTransactionsDelta).toHaveBeenCalledWith("plan-1", 106);
    expect(deltaClient.listTransactionsDelta).toHaveBeenCalledWith("plan-1", 107);
    expect(moneyMovementClient.listMoneyMovementGroups).toHaveBeenCalledWith("plan-1");
    expect(moneyMovementClient.listMoneyMovements).toHaveBeenCalledWith("plan-1");
    expect(syncStateRepository.advanceCursor).toHaveBeenCalledTimes(8);
    expect(syncStateRepository.advanceCursor).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: "categories",
      rowsUpserted: 2,
      serverKnowledge: 202
    }));
    expect(syncStateRepository.advanceCursor).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: "money_movements",
      rowsDeleted: 0,
      rowsUpserted: 2,
      serverKnowledge: 209
    }));
    expect(syncStateRepository.advanceCursor).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: "transactions",
      rowsDeleted: 0,
      rowsUpserted: 1,
      serverKnowledge: 207
    }));
    expect(result).toMatchObject({
      endpointResults: expect.arrayContaining([
        expect.objectContaining({ endpoint: "accounts", rowsUpserted: 1, status: "ok" }),
        expect.objectContaining({ endpoint: "categories", rowsUpserted: 2, status: "ok" }),
        expect.objectContaining({ endpoint: "money_movements", rowsUpserted: 2, status: "ok" }),
        expect.objectContaining({ endpoint: "months", rowsUpserted: 2, status: "ok" }),
        expect.objectContaining({ endpoint: "transactions", rowsUpserted: 1, status: "ok" })
      ]),
      status: "ok"
    });
  });

  it("records one endpoint failure and continues syncing later endpoints", async () => {
    const deltaClient = {
      listAccountsDelta: vi.fn(async () => ({ records: [{ id: "account-1" }, { id: "account-2" }], serverKnowledge: 201 })),
      listCategoriesDelta: vi.fn(async () => ({ records: [], serverKnowledge: 202 })),
      listMonthsDelta: vi.fn(async () => ({ records: [], serverKnowledge: 203 })),
      listPayeesDelta: vi.fn(async () => ({ records: [], serverKnowledge: 204 })),
      listPayeeLocationsDelta: vi.fn(async () => ({ records: [], serverKnowledge: 205 })),
      listScheduledTransactionsDelta: vi.fn(async () => ({ records: [], serverKnowledge: 206 })),
      listTransactionsDelta: vi.fn(async () => ({ records: [], serverKnowledge: 207 }))
    } as unknown as YnabDeltaClient;
    const syncStateRepository = createSyncStateRepository();
    const readModelRepository = {
      upsertAccounts: vi.fn(),
      upsertCategoryGroups: vi.fn(async () => ({ categoriesUpserted: 0, categoryGroupsUpserted: 0 })),
      upsertMonths: vi.fn(async () => ({ monthCategoriesUpserted: 0, monthsUpserted: 0 })),
      upsertMoneyMovementGroups: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertMoneyMovements: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertPayees: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertPayeeLocations: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertScheduledTransactions: vi.fn(async () => ({ rowsUpserted: 0 }))
    };
    const transactionsRepository = {
      upsertTransactions: vi.fn(async () => ({ rowsDeleted: 0, rowsUpserted: 0 }))
    };
    const service = createReadModelSyncService({
      deltaClient,
      maxRowsPerRun: 1,
      readModelRepository,
      syncStateRepository,
      transactionsRepository
    });

    const result = await service.syncReadModel({
      leaseOwner: "cron:123",
      now: "2026-04-28T12:00:00.000Z",
      planId: "plan-1"
    });

    expect(readModelRepository.upsertAccounts).not.toHaveBeenCalled();
    expect(deltaClient.listCategoriesDelta).toHaveBeenCalled();
    expect(syncStateRepository.recordFailure).toHaveBeenCalledWith({
      endpoint: "accounts",
      error: "Delta response contained 2 rows, exceeding the configured limit of 1.",
      leaseOwner: "cron:123",
      now: "2026-04-28T12:00:00.000Z",
      planId: "plan-1"
    });
    expect(result).toMatchObject({
      endpointResults: expect.arrayContaining([
        expect.objectContaining({ endpoint: "accounts", reason: "row_limit_exceeded", status: "failed" }),
        expect.objectContaining({ endpoint: "categories", status: "ok" })
      ]),
      status: "failed"
    });
  });
});
