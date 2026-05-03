import { describe, expect, it, vi } from "vitest";

import { YnabClientError } from "../client.js";
import type { YnabDeltaClient } from "../delta-client.js";
import { createReadModelSyncService } from "./read-model-sync-service.js";

function createSyncStateRepository() {
  return {
    acquireLease: vi.fn(async () => ({
      acquired: true as const,
      leaseExpiresAt: "2026-04-28T12:01:00.000Z",
    })),
    advanceCursor: vi.fn(async () => ({
      advanced: true as const,
    })),
    getServerKnowledge: vi.fn(
      async (_planId: string, endpoint: string) =>
        ({
          accounts: 101,
          categories: 102,
          months: 103,
          payees: 104,
          payee_locations: 105,
          scheduled_transactions: 106,
          transactions: 107,
          money_movements: 108,
        })[endpoint] ?? null,
    ),
    recordFailure: vi.fn(async () => undefined),
  };
}

describe("read-model sync service", () => {
  it("syncs only the consistency-safe financial endpoints for the hot profile", async () => {
    const deltaClient = {
      listAccountsDelta: vi.fn(async () => ({
        records: [],
        serverKnowledge: 201,
      })),
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
    const metadataClient = {
      getPlan: vi.fn(async () => ({ id: "plan-1", name: "Main Budget" })),
      getPlanSettings: vi.fn(async () => ({})),
      getUser: vi.fn(async () => ({ id: "user-1", name: "Avery" })),
      listPlans: vi.fn(async () => ({
        defaultPlan: { id: "plan-1", name: "Main Budget" },
        plans: [{ id: "plan-1", name: "Main Budget" }],
      })),
    };
    const moneyMovementClient = {
      listMoneyMovementGroups: vi.fn(async () => ({
        moneyMovementGroups: [],
        serverKnowledge: 208,
      })),
      listMoneyMovements: vi.fn(async () => ({
        moneyMovements: [],
        serverKnowledge: 209,
      })),
    };
    const syncStateRepository = createSyncStateRepository();
    const readModelRepository = {
      upsertAccounts: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertCategoryGroups: vi.fn(async () => ({
        categoriesUpserted: 0,
        categoryGroupsUpserted: 0,
      })),
      upsertMonths: vi.fn(async () => ({
        monthCategoriesUpserted: 0,
        monthsUpserted: 0,
      })),
      upsertMoneyMovementGroups: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertMoneyMovements: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertPayees: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertPayeeLocations: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertPlanDetail: vi.fn(async () => ({ rowsUpserted: 1 })),
      upsertPlans: vi.fn(async () => ({ rowsUpserted: 1 })),
      upsertPlanSettings: vi.fn(async () => ({ rowsUpserted: 1 })),
      upsertScheduledTransactions: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertUser: vi.fn(async () => ({ rowsUpserted: 1 })),
    };
    const transactionsRepository = {
      upsertTransactions: vi.fn(async () => ({
        rowsDeleted: 0,
        rowsUpserted: 0,
      })),
    };
    const service = createReadModelSyncService({
      deltaClient,
      metadataClient,
      moneyMovementClient,
      readModelRepository,
      syncStateRepository,
      transactionsRepository,
    });

    const result = await service.syncReadModel({
      leaseOwner: "cron:hot",
      now: "2026-04-28T12:00:00.000Z",
      planId: "plan-1",
      profile: "hot_financial",
    });

    expect(result).toMatchObject({
      endpointResults: [
        expect.objectContaining({ endpoint: "accounts", status: "ok" }),
        expect.objectContaining({ endpoint: "categories", status: "ok" }),
        expect.objectContaining({ endpoint: "months", status: "ok" }),
        expect.objectContaining({
          endpoint: "scheduled_transactions",
          status: "ok",
        }),
        expect.objectContaining({ endpoint: "transactions", status: "ok" }),
      ],
      profile: "hot_financial",
      status: "ok",
    });
    expect(metadataClient.getUser).not.toHaveBeenCalled();
    expect(metadataClient.listPlans).not.toHaveBeenCalled();
    expect(metadataClient.getPlan).not.toHaveBeenCalled();
    expect(metadataClient.getPlanSettings).not.toHaveBeenCalled();
    expect(deltaClient.listPayeesDelta).not.toHaveBeenCalled();
    expect(deltaClient.listPayeeLocationsDelta).not.toHaveBeenCalled();
    expect(moneyMovementClient.listMoneyMovements).not.toHaveBeenCalled();
    expect(moneyMovementClient.listMoneyMovementGroups).not.toHaveBeenCalled();
    expect(syncStateRepository.acquireLease).toHaveBeenCalledTimes(5);
  });

  it("records endpoint run history without changing cursor safety", async () => {
    const deltaClient = {
      listAccountsDelta: vi.fn(async () => ({
        records: [{ id: "account-1" }],
        serverKnowledge: 201,
      })),
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
    const syncStateRepository = createSyncStateRepository();
    const syncRunRepository = {
      finishEndpointRun: vi.fn(async () => undefined),
      startEndpointRun: vi.fn(async () => undefined),
    };
    const readModelRepository = {
      upsertAccounts: vi.fn(async () => ({ rowsUpserted: 1 })),
      upsertCategoryGroups: vi.fn(async () => ({
        categoriesUpserted: 0,
        categoryGroupsUpserted: 0,
      })),
      upsertMonths: vi.fn(async () => ({
        monthCategoriesUpserted: 0,
        monthsUpserted: 0,
      })),
      upsertMoneyMovementGroups: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertMoneyMovements: vi.fn(async () => ({ rowsUpserted: 0 })),
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
      readModelRepository,
      syncRunRepository,
      syncStateRepository,
      transactionsRepository,
    });

    await service.syncReadModel({
      leaseOwner: "cron:123",
      now: "2026-04-28T12:00:00.000Z",
      planId: "plan-1",
      profile: "hot_financial",
    });

    expect(syncRunRepository.startEndpointRun).toHaveBeenCalledWith({
      endpoint: "accounts",
      id: "cron:123:accounts",
      planId: "plan-1",
      serverKnowledgeBefore: 101,
      startedAt: "2026-04-28T12:00:00.000Z",
    });
    expect(syncRunRepository.finishEndpointRun).toHaveBeenCalledWith({
      error: null,
      finishedAt: "2026-04-28T12:00:00.000Z",
      id: "cron:123:accounts",
      rowsDeleted: 0,
      rowsUpserted: 1,
      serverKnowledgeAfter: 201,
      status: "ok",
    });
    expect(syncStateRepository.advanceCursor).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "accounts",
        serverKnowledge: 201,
      }),
    );
  });

  it("does not block endpoint delta fetches on diagnostic run-history writes", async () => {
    // DEFECT: slow diagnostic sync-run storage can delay the actual sync endpoint work.
    const deltaClient = {
      listAccountsDelta: vi.fn(async () => ({
        records: [{ id: "account-1" }],
        serverKnowledge: 201,
      })),
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
    const syncStateRepository = createSyncStateRepository();
    let resolveStartRun: () => void = () => undefined;
    const startRun = new Promise<void>((resolve) => {
      resolveStartRun = resolve;
    });
    const syncRunRepository = {
      finishEndpointRun: vi.fn(async () => undefined),
      startEndpointRun: vi.fn((input: { endpoint: string }) =>
        input.endpoint === "accounts" ? startRun : Promise.resolve(),
      ),
    };
    const readModelRepository = {
      upsertAccounts: vi.fn(async () => ({ rowsUpserted: 1 })),
      upsertCategoryGroups: vi.fn(async () => ({
        categoriesUpserted: 0,
        categoryGroupsUpserted: 0,
      })),
      upsertMonths: vi.fn(async () => ({
        monthCategoriesUpserted: 0,
        monthsUpserted: 0,
      })),
      upsertMoneyMovementGroups: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertMoneyMovements: vi.fn(async () => ({ rowsUpserted: 0 })),
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
      readModelRepository,
      syncRunRepository,
      syncStateRepository,
      transactionsRepository,
    });

    const result = service.syncReadModel({
      leaseOwner: "cron:123",
      now: "2026-04-28T12:00:00.000Z",
      planId: "plan-1",
      profile: "hot_financial",
    });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(syncRunRepository.startEndpointRun).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "accounts" }),
    );
    expect(deltaClient.listAccountsDelta).toHaveBeenCalledWith("plan-1", 101);

    resolveStartRun();

    await expect(result).resolves.toMatchObject({
      endpointResults: expect.arrayContaining([
        expect.objectContaining({ endpoint: "accounts", status: "ok" }),
      ]),
      status: "ok",
    });
  });

  it("stops the current poll when a global YNAB failure would burn the remaining request budget", async () => {
    const deltaClient = {
      listAccountsDelta: vi.fn(async () => {
        throw new YnabClientError(
          "YNAB API request failed with 429: Too many requests",
          "rate_limit",
          true,
        );
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
    const syncStateRepository = createSyncStateRepository();
    const readModelRepository = {
      upsertAccounts: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertCategoryGroups: vi.fn(async () => ({
        categoriesUpserted: 0,
        categoryGroupsUpserted: 0,
      })),
      upsertMonths: vi.fn(async () => ({
        monthCategoriesUpserted: 0,
        monthsUpserted: 0,
      })),
      upsertMoneyMovementGroups: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertMoneyMovements: vi.fn(async () => ({ rowsUpserted: 0 })),
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
      readModelRepository,
      syncStateRepository,
      transactionsRepository,
    });

    const result = await service.syncReadModel({
      leaseOwner: "cron:hot",
      now: "2026-04-28T12:00:00.000Z",
      planId: "plan-1",
      profile: "hot_financial",
    });

    expect(result).toMatchObject({
      endpointResults: [
        {
          endpoint: "accounts",
          reason: "YNAB API request failed with 429: Too many requests",
          status: "failed",
        },
      ],
      status: "failed",
    });
    expect(deltaClient.listCategoriesDelta).not.toHaveBeenCalled();
    expect(deltaClient.listMonthsDelta).not.toHaveBeenCalled();
    expect(deltaClient.listScheduledTransactionsDelta).not.toHaveBeenCalled();
    expect(deltaClient.listTransactionsDelta).not.toHaveBeenCalled();
  });

  it("uses longer endpoint leases for full syncs than hot delta syncs", async () => {
    const deltaClient = {
      listAccountsDelta: vi.fn(async () => ({
        records: [],
        serverKnowledge: 201,
      })),
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
    const syncStateRepository = createSyncStateRepository();
    const readModelRepository = {
      upsertAccounts: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertCategoryGroups: vi.fn(async () => ({
        categoriesUpserted: 0,
        categoryGroupsUpserted: 0,
      })),
      upsertMonths: vi.fn(async () => ({
        monthCategoriesUpserted: 0,
        monthsUpserted: 0,
      })),
      upsertMoneyMovementGroups: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertMoneyMovements: vi.fn(async () => ({ rowsUpserted: 0 })),
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
      readModelRepository,
      syncStateRepository,
      transactionsRepository,
    });

    await service.syncReadModel({
      leaseOwner: "cron:hot",
      now: "2026-04-28T12:00:00.000Z",
      planId: "plan-1",
      profile: "hot_financial",
    });
    await service.syncReadModel({
      leaseOwner: "cron:full",
      now: "2026-04-28T12:05:00.000Z",
      planId: "plan-1",
      profile: "full",
    });

    expect(syncStateRepository.acquireLease).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "accounts",
        leaseOwner: "cron:hot",
        leaseSeconds: 60,
      }),
    );
    expect(syncStateRepository.acquireLease).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "accounts",
        leaseOwner: "cron:full",
        leaseSeconds: 300,
      }),
    );
  });

  it("syncs budget metadata and advances freshness cursors for metadata-backed tools", async () => {
    const deltaClient = {
      listAccountsDelta: vi.fn(async () => ({
        records: [],
        serverKnowledge: 201,
      })),
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
    const metadataClient = {
      getPlan: vi.fn(async () => ({
        firstMonth: "2026-01-01",
        id: "plan-1",
        lastMonth: "2026-12-01",
        name: "Main Budget",
      })),
      getPlanSettings: vi.fn(async () => ({
        currencyFormat: { isoCode: "USD" },
        dateFormat: { format: "MM/DD/YYYY" },
      })),
      getUser: vi.fn(async () => ({ id: "user-1", name: "Avery" })),
      listPlans: vi.fn(async () => ({
        defaultPlan: { id: "plan-1", name: "Main Budget" },
        plans: [{ id: "plan-1", name: "Main Budget" }],
      })),
    };
    const syncStateRepository = createSyncStateRepository();
    const readModelRepository = {
      upsertAccounts: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertCategoryGroups: vi.fn(async () => ({
        categoriesUpserted: 0,
        categoryGroupsUpserted: 0,
      })),
      upsertMonths: vi.fn(async () => ({
        monthCategoriesUpserted: 0,
        monthsUpserted: 0,
      })),
      upsertMoneyMovementGroups: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertMoneyMovements: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertPayees: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertPayeeLocations: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertPlanDetail: vi.fn(async () => ({ rowsUpserted: 1 })),
      upsertPlans: vi.fn(async () => ({ rowsUpserted: 1 })),
      upsertPlanSettings: vi.fn(async () => ({ rowsUpserted: 1 })),
      upsertScheduledTransactions: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertUser: vi.fn(async () => ({ rowsUpserted: 1 })),
    };
    const transactionsRepository = {
      upsertTransactions: vi.fn(async () => ({
        rowsDeleted: 0,
        rowsUpserted: 0,
      })),
    };
    const service = createReadModelSyncService({
      deltaClient,
      metadataClient,
      readModelRepository,
      syncStateRepository,
      transactionsRepository,
    });

    const result = await service.syncReadModel({
      leaseOwner: "cron:123",
      now: "2026-04-28T12:00:00.000Z",
      planId: "plan-1",
    });

    expect(metadataClient.getUser).toHaveBeenCalledWith();
    expect(metadataClient.listPlans).toHaveBeenCalledWith();
    expect(metadataClient.getPlan).toHaveBeenCalledWith("plan-1");
    expect(metadataClient.getPlanSettings).toHaveBeenCalledWith("plan-1");
    expect(readModelRepository.upsertUser).toHaveBeenCalledWith({
      syncedAt: "2026-04-28T12:00:00.000Z",
      user: { id: "user-1", name: "Avery" },
    });
    expect(readModelRepository.upsertPlans).toHaveBeenCalledWith({
      plans: [{ id: "plan-1", name: "Main Budget" }],
      syncedAt: "2026-04-28T12:00:00.000Z",
    });
    expect(readModelRepository.upsertPlanDetail).toHaveBeenCalledWith({
      plan: expect.objectContaining({ firstMonth: "2026-01-01", id: "plan-1" }),
      syncedAt: "2026-04-28T12:00:00.000Z",
    });
    expect(readModelRepository.upsertPlanSettings).toHaveBeenCalledWith({
      planId: "plan-1",
      settings: expect.objectContaining({
        dateFormat: { format: "MM/DD/YYYY" },
      }),
      syncedAt: "2026-04-28T12:00:00.000Z",
    });
    expect(syncStateRepository.advanceCursor).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "users",
        rowsUpserted: 1,
        serverKnowledge: 0,
      }),
    );
    expect(syncStateRepository.advanceCursor).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "plans",
        rowsUpserted: 2,
        serverKnowledge: 0,
      }),
    );
    expect(syncStateRepository.advanceCursor).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "plan_settings",
        rowsUpserted: 1,
        serverKnowledge: 0,
      }),
    );
    expect(result.endpointResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ endpoint: "users", status: "ok" }),
        expect.objectContaining({
          endpoint: "plans",
          rowsUpserted: 2,
          status: "ok",
        }),
        expect.objectContaining({ endpoint: "plan_settings", status: "ok" }),
      ]),
    );
  });

  it("syncs every cursor-backed endpoint through its own lease and cursor", async () => {
    const deltaClient = {
      listAccountsDelta: vi.fn(async () => ({
        records: [{ id: "account-1" }],
        serverKnowledge: 201,
      })),
      listCategoriesDelta: vi.fn(async () => ({
        records: [{ id: "group-1", categories: [{ id: "category-1" }] }],
        serverKnowledge: 202,
      })),
      listMonthsDelta: vi.fn(async () => ({
        records: [{ month: "2026-04-01", categories: [{ id: "category-1" }] }],
        serverKnowledge: 203,
      })),
      listPayeesDelta: vi.fn(async () => ({
        records: [{ id: "payee-1" }],
        serverKnowledge: 204,
      })),
      listPayeeLocationsDelta: vi.fn(async () => ({
        records: [{ id: "location-1" }],
        serverKnowledge: 205,
      })),
      listScheduledTransactionsDelta: vi.fn(async () => ({
        records: [{ id: "scheduled-1" }],
        serverKnowledge: 206,
      })),
      listTransactionsDelta: vi.fn(async () => ({
        records: [{ id: "txn-1", amount: -12000, date: "2026-04-12" }],
        serverKnowledge: 207,
      })),
    } as unknown as YnabDeltaClient;
    const syncStateRepository = createSyncStateRepository();
    const readModelRepository = {
      upsertAccounts: vi.fn(async () => ({ rowsUpserted: 1 })),
      upsertCategoryGroups: vi.fn(async () => ({
        categoriesUpserted: 1,
        categoryGroupsUpserted: 1,
      })),
      upsertMonths: vi.fn(async () => ({
        monthCategoriesUpserted: 1,
        monthsUpserted: 1,
      })),
      upsertMoneyMovementGroups: vi.fn(async () => ({ rowsUpserted: 1 })),
      upsertMoneyMovements: vi.fn(async () => ({ rowsUpserted: 1 })),
      upsertPayees: vi.fn(async () => ({ rowsUpserted: 1 })),
      upsertPayeeLocations: vi.fn(async () => ({ rowsUpserted: 1 })),
      upsertScheduledTransactions: vi.fn(async () => ({ rowsUpserted: 1 })),
    };
    const transactionsRepository = {
      upsertTransactions: vi.fn(async () => ({
        rowsDeleted: 0,
        rowsUpserted: 1,
      })),
    };
    const moneyMovementClient = {
      listMoneyMovementGroups: vi.fn(async () => ({
        moneyMovementGroups: [
          {
            groupCreatedAt: "2026-04-28T12:00:00.000Z",
            id: "movement-group-1",
            month: "2026-04-01",
          },
        ],
        serverKnowledge: 208,
      })),
      listMoneyMovements: vi.fn(async () => ({
        moneyMovements: [{ amount: 12000, id: "movement-1" }],
        serverKnowledge: 209,
      })),
    };
    const service = createReadModelSyncService({
      deltaClient,
      moneyMovementClient,
      readModelRepository,
      syncStateRepository,
      transactionsRepository,
    });

    const result = await service.syncReadModel({
      leaseOwner: "cron:123",
      now: "2026-04-28T12:00:00.000Z",
      planId: "plan-1",
    });

    expect(deltaClient.listAccountsDelta).toHaveBeenCalledWith("plan-1", 101);
    expect(deltaClient.listCategoriesDelta).toHaveBeenCalledWith("plan-1", 102);
    expect(deltaClient.listMonthsDelta).toHaveBeenCalledWith("plan-1", 103);
    expect(deltaClient.listPayeesDelta).toHaveBeenCalledWith("plan-1", 104);
    expect(deltaClient.listPayeeLocationsDelta).toHaveBeenCalledWith(
      "plan-1",
      105,
    );
    expect(deltaClient.listScheduledTransactionsDelta).toHaveBeenCalledWith(
      "plan-1",
      106,
    );
    expect(deltaClient.listTransactionsDelta).toHaveBeenCalledWith(
      "plan-1",
      107,
    );
    expect(moneyMovementClient.listMoneyMovementGroups).toHaveBeenCalledWith(
      "plan-1",
      108,
    );
    expect(moneyMovementClient.listMoneyMovements).toHaveBeenCalledWith(
      "plan-1",
      108,
    );
    expect(syncStateRepository.advanceCursor).toHaveBeenCalledTimes(8);
    expect(syncStateRepository.advanceCursor).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "categories",
        rowsUpserted: 2,
        serverKnowledge: 202,
      }),
    );
    expect(syncStateRepository.advanceCursor).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "money_movements",
        rowsDeleted: 0,
        rowsUpserted: 2,
        serverKnowledge: 208,
      }),
    );
    expect(syncStateRepository.advanceCursor).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "transactions",
        rowsDeleted: 0,
        rowsUpserted: 1,
        serverKnowledge: 207,
      }),
    );
    expect(result).toMatchObject({
      endpointResults: expect.arrayContaining([
        expect.objectContaining({
          endpoint: "accounts",
          rowsUpserted: 1,
          status: "ok",
        }),
        expect.objectContaining({
          endpoint: "categories",
          rowsUpserted: 2,
          status: "ok",
        }),
        expect.objectContaining({
          endpoint: "money_movements",
          rowsUpserted: 2,
          status: "ok",
        }),
        expect.objectContaining({
          endpoint: "months",
          rowsUpserted: 2,
          status: "ok",
        }),
        expect.objectContaining({
          endpoint: "transactions",
          rowsUpserted: 1,
          status: "ok",
        }),
      ]),
      status: "ok",
    });
  });

  it("passes previous server knowledge to money movement sync reads", async () => {
    // DEFECT: money movement sync can refetch full history despite having a cursor.
    const deltaClient = {
      listAccountsDelta: vi.fn(async () => ({
        records: [],
        serverKnowledge: 1,
      })),
      listCategoriesDelta: vi.fn(async () => ({
        records: [],
        serverKnowledge: 1,
      })),
      listMonthsDelta: vi.fn(async () => ({ records: [], serverKnowledge: 1 })),
      listPayeesDelta: vi.fn(async () => ({ records: [], serverKnowledge: 1 })),
      listPayeeLocationsDelta: vi.fn(async () => ({
        records: [],
        serverKnowledge: 1,
      })),
      listScheduledTransactionsDelta: vi.fn(async () => ({
        records: [],
        serverKnowledge: 1,
      })),
      listTransactionsDelta: vi.fn(async () => ({
        records: [],
        serverKnowledge: 1,
      })),
    } as unknown as YnabDeltaClient;
    const syncStateRepository = createSyncStateRepository();
    const readModelRepository = {
      upsertAccounts: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertCategoryGroups: vi.fn(async () => ({
        categoriesUpserted: 0,
        categoryGroupsUpserted: 0,
      })),
      upsertMonths: vi.fn(async () => ({
        monthCategoriesUpserted: 0,
        monthsUpserted: 0,
      })),
      upsertMoneyMovementGroups: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertMoneyMovements: vi.fn(async () => ({ rowsUpserted: 0 })),
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
    const moneyMovementClient = {
      listMoneyMovementGroups: vi.fn(async () => ({
        moneyMovementGroups: [],
        serverKnowledge: 50,
      })),
      listMoneyMovements: vi.fn(async () => ({
        moneyMovements: [],
        serverKnowledge: 55,
      })),
    };
    const service = createReadModelSyncService({
      deltaClient,
      moneyMovementClient,
      readModelRepository,
      syncStateRepository,
      transactionsRepository,
    });

    await service.syncReadModel({
      leaseOwner: "cron:123",
      now: "2026-04-28T12:00:00.000Z",
      planId: "plan-1",
    });

    expect(moneyMovementClient.listMoneyMovements).toHaveBeenCalledWith(
      "plan-1",
      108,
    );
    expect(moneyMovementClient.listMoneyMovementGroups).toHaveBeenCalledWith(
      "plan-1",
      108,
    );
    expect(syncStateRepository.advanceCursor).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "money_movements",
        serverKnowledge: 50,
      }),
    );
  });

  it("writes large initial deltas instead of permanently failing on the row limit", async () => {
    const deltaClient = {
      listAccountsDelta: vi.fn(async () => ({
        records: [{ id: "account-1" }, { id: "account-2" }],
        serverKnowledge: 201,
      })),
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
    const syncStateRepository = createSyncStateRepository();
    const readModelRepository = {
      upsertAccounts: vi.fn(async () => ({ rowsUpserted: 2 })),
      upsertCategoryGroups: vi.fn(async () => ({
        categoriesUpserted: 0,
        categoryGroupsUpserted: 0,
      })),
      upsertMonths: vi.fn(async () => ({
        monthCategoriesUpserted: 0,
        monthsUpserted: 0,
      })),
      upsertMoneyMovementGroups: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertMoneyMovements: vi.fn(async () => ({ rowsUpserted: 0 })),
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
      readModelRepository,
      syncStateRepository,
      transactionsRepository,
    });

    const result = await service.syncReadModel({
      leaseOwner: "cron:123",
      now: "2026-04-28T12:00:00.000Z",
      planId: "plan-1",
    });

    expect(readModelRepository.upsertAccounts).toHaveBeenCalledWith({
      accounts: [{ id: "account-1" }, { id: "account-2" }],
      planId: "plan-1",
      syncedAt: "2026-04-28T12:00:00.000Z",
    });
    expect(deltaClient.listCategoriesDelta).toHaveBeenCalled();
    expect(syncStateRepository.recordFailure).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      endpointResults: expect.arrayContaining([
        expect.objectContaining({
          endpoint: "accounts",
          rowsUpserted: 2,
          status: "ok",
        }),
        expect.objectContaining({ endpoint: "categories", status: "ok" }),
      ]),
      status: "ok",
    });
  });

  it("keeps sync health ok when large deltas exceed 100 records", async () => {
    const categories = Array.from({ length: 104 }, (_, index) => ({
      balance: index,
      hidden: false,
      id: `category-${index}`,
      name: `Category ${index}`,
    }));
    const transactions = Array.from({ length: 4_379 }, (_, index) => ({
      amount: -1000,
      date: "2026-04-12",
      deleted: false,
      id: `txn-${index}`,
    }));
    const moneyMovements = Array.from({ length: 316 }, (_, index) => ({
      amount: 1000,
      deleted: false,
      id: `movement-${index}`,
      month: "2026-04-01",
      movedAt: "2026-04-03T10:00:00Z",
    }));
    const deltaClient = {
      listAccountsDelta: vi.fn(async () => ({
        records: [],
        serverKnowledge: 201,
      })),
      listCategoriesDelta: vi.fn(async () => ({
        records: [
          {
            categories,
            deleted: false,
            hidden: false,
            id: "group-1",
            name: "Everyday",
          },
        ],
        serverKnowledge: 202,
      })),
      listMonthsDelta: vi.fn(async () => ({
        records: [
          {
            categories,
            month: "2026-04-01",
          },
        ],
        serverKnowledge: 203,
      })),
      listPayeesDelta: vi.fn(async () => ({
        records: Array.from({ length: 539 }, (_, index) => ({
          deleted: false,
          id: `payee-${index}`,
          name: `Payee ${index}`,
        })),
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
        records: transactions,
        serverKnowledge: 207,
      })),
    } as unknown as YnabDeltaClient;
    const moneyMovementClient = {
      listMoneyMovementGroups: vi.fn(async () => ({
        moneyMovementGroups: [],
        serverKnowledge: 208,
      })),
      listMoneyMovements: vi.fn(async () => ({
        moneyMovements,
        serverKnowledge: 208,
      })),
    };
    const syncStateRepository = createSyncStateRepository();
    const readModelRepository = {
      upsertAccounts: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertCategoryGroups: vi.fn(async () => ({
        categoriesUpserted: 104,
        categoryGroupsUpserted: 1,
      })),
      upsertMonths: vi.fn(async () => ({
        monthCategoriesUpserted: 104,
        monthsUpserted: 1,
      })),
      upsertMoneyMovementGroups: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertMoneyMovements: vi.fn(async () => ({ rowsUpserted: 316 })),
      upsertPayees: vi.fn(async () => ({ rowsUpserted: 539 })),
      upsertPayeeLocations: vi.fn(async () => ({ rowsUpserted: 0 })),
      upsertScheduledTransactions: vi.fn(async () => ({ rowsUpserted: 0 })),
    };
    const transactionsRepository = {
      upsertTransactions: vi.fn(async () => ({
        rowsDeleted: 0,
        rowsUpserted: 4_379,
      })),
    };
    const service = createReadModelSyncService({
      deltaClient,
      moneyMovementClient,
      readModelRepository,
      syncStateRepository,
      transactionsRepository,
    });

    const result = await service.syncReadModel({
      leaseOwner: "cron:123",
      now: "2026-04-28T12:00:00.000Z",
      planId: "plan-1",
    });

    expect(syncStateRepository.recordFailure).not.toHaveBeenCalled();
    expect(syncStateRepository.advanceCursor).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "categories",
        rowsUpserted: 105,
        serverKnowledge: 202,
      }),
    );
    expect(syncStateRepository.advanceCursor).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "months",
        rowsUpserted: 105,
        serverKnowledge: 203,
      }),
    );
    expect(syncStateRepository.advanceCursor).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "payees",
        rowsUpserted: 539,
        serverKnowledge: 204,
      }),
    );
    expect(syncStateRepository.advanceCursor).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "money_movements",
        rowsUpserted: 316,
        serverKnowledge: 208,
      }),
    );
    expect(syncStateRepository.advanceCursor).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "transactions",
        rowsUpserted: 4_379,
        serverKnowledge: 207,
      }),
    );
    expect(result).toMatchObject({
      endpointResults: expect.arrayContaining([
        expect.objectContaining({
          endpoint: "categories",
          rowsUpserted: 105,
          status: "ok",
        }),
        expect.objectContaining({
          endpoint: "months",
          rowsUpserted: 105,
          status: "ok",
        }),
        expect.objectContaining({
          endpoint: "payees",
          rowsUpserted: 539,
          status: "ok",
        }),
        expect.objectContaining({
          endpoint: "money_movements",
          rowsUpserted: 316,
          status: "ok",
        }),
        expect.objectContaining({
          endpoint: "transactions",
          rowsUpserted: 4_379,
          status: "ok",
        }),
      ]),
      status: "ok",
    });
  });
});
