import { describe, expect, it, vi } from "vitest";

import type { YnabDeltaClient } from "../platform/ynab/delta-client.js";
import { createReadModelSyncService } from "../platform/ynab/read-model/read-model-sync-service.js";

describe("read-model sync service chaos", () => {
  it("returns the original endpoint failure when recording the failure also fails", async () => {
    const deltaClient = {
      listAccountsDelta: vi.fn(async () => {
        throw new Error("YNAB accounts endpoint unavailable");
      }),
      listCategoriesDelta: vi.fn(async () => ({
        records: [],
        serverKnowledge: 202,
      })),
      listMonthsDelta: vi.fn(async () => ({
        records: [],
        serverKnowledge: 203,
      })),
      listPayeesDelta: vi.fn(async () => ({
        records: [],
        serverKnowledge: 204,
      })),
      listPayeeLocationsDelta: vi.fn(async () => ({
        records: [],
        serverKnowledge: 205,
      })),
      listScheduledTransactionsDelta: vi.fn(async () => ({
        records: [],
        serverKnowledge: 206,
      })),
      listTransactionsDelta: vi.fn(async () => ({
        records: [],
        serverKnowledge: 207,
      })),
    } as unknown as YnabDeltaClient;
    const syncStateRepository = {
      acquireLease: vi.fn(async () => ({
        acquired: true as const,
        leaseExpiresAt: "2026-04-29T12:01:00.000Z",
      })),
      advanceCursor: vi.fn(async () => ({ advanced: true as const })),
      getServerKnowledge: vi.fn(async () => null),
      recordFailure: vi.fn(async () => {
        throw new Error("D1 failure recorder unavailable");
      }),
    };
    const readModelRepository = {
      upsertAccounts: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertCategoryGroups: vi.fn(async () => ({
        categoriesUpserted: 0,
        categoryGroupsUpserted: 0,
      })),
      upsertMoneyMovementGroups: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertMoneyMovements: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertMonths: vi.fn(async () => ({
        monthCategoriesUpserted: 0,
        monthsUpserted: 0,
      })),
      upsertPayees: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertPayeeLocations: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertScheduledTransactions: vi.fn(async () => ({ rowsUpserted: 0 })),
    };
    const transactionsRepository = {
      upsertTransactions: vi.fn(async () => ({
        rowsDeleted: 0,
        rowsUpserted: 0,
      })),
    };
    const service = createReadModelSyncService({
      deltaClient,
      maxRowsPerRun: 100,
      readModelRepository,
      syncStateRepository,
      transactionsRepository,
    });

    const result = await service.syncReadModel({
      leaseOwner: "scheduled:177",
      now: "2026-04-29T12:00:00.000Z",
      planId: "plan-1",
    });

    expect(result).toMatchObject({
      endpointResults: expect.arrayContaining([
        {
          endpoint: "accounts",
          reason: "YNAB accounts endpoint unavailable",
          status: "failed",
        },
      ]),
      status: "failed",
    });
    expect(syncStateRepository.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "accounts",
        error: "YNAB accounts endpoint unavailable",
      }),
    );
  });
});
