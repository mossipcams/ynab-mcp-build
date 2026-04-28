import type {
  YnabAccountSummary,
  YnabCategoryGroupSummary,
  YnabMoneyMovement,
  YnabMoneyMovementGroup,
  YnabPayee,
  YnabPayeeLocation,
  YnabPlanMonthDetail,
  YnabScheduledTransaction
} from "../client.js";
import type { YnabDeltaClient, YnabDeltaResponse, YnabDeltaTransactionRecord } from "../delta-client.js";

type SyncStateRepository = {
  acquireLease(input: {
    planId: string;
    endpoint: string;
    leaseOwner: string;
    leaseSeconds: number;
    now: string;
  }): Promise<
    | { acquired: true; leaseExpiresAt: string }
    | { acquired: false; reason: "lease_active" | "contention" }
  >;
  getServerKnowledge(planId: string, endpoint: string): Promise<number | null>;
  advanceCursor(input: {
    planId: string;
    endpoint: string;
    leaseOwner: string;
    previousServerKnowledge: number | null;
    serverKnowledge: number;
    rowsUpserted: number;
    rowsDeleted: number;
    now: string;
  }): Promise<
    | { advanced: true }
    | { advanced: false; reason: "contention" }
  >;
  recordFailure(input: {
    planId: string;
    endpoint: string;
    leaseOwner: string;
    error: string;
    now: string;
  }): Promise<void>;
};

type ReadModelRepository = {
  upsertAccounts(input: {
    planId: string;
    accounts: YnabAccountSummary[];
    syncedAt: string;
  }): Promise<{ rowsUpserted: number }>;
  upsertCategoryGroups(input: {
    planId: string;
    categoryGroups: YnabCategoryGroupSummary[];
    syncedAt: string;
  }): Promise<{ categoryGroupsUpserted: number; categoriesUpserted: number }>;
  upsertMonths(input: {
    planId: string;
    months: YnabPlanMonthDetail[];
    syncedAt: string;
  }): Promise<{ monthsUpserted: number; monthCategoriesUpserted: number }>;
  upsertMoneyMovementGroups(input: {
    planId: string;
    moneyMovementGroups: YnabMoneyMovementGroup[];
    syncedAt: string;
  }): Promise<{ rowsUpserted: number }>;
  upsertMoneyMovements(input: {
    planId: string;
    moneyMovements: YnabMoneyMovement[];
    syncedAt: string;
  }): Promise<{ rowsUpserted: number }>;
  upsertPayees(input: {
    planId: string;
    payees: YnabPayee[];
    syncedAt: string;
  }): Promise<{ rowsUpserted: number }>;
  upsertPayeeLocations(input: {
    planId: string;
    locations: YnabPayeeLocation[];
    syncedAt: string;
  }): Promise<{ rowsUpserted: number }>;
  upsertScheduledTransactions(input: {
    planId: string;
    scheduledTransactions: YnabScheduledTransaction[];
    syncedAt: string;
  }): Promise<{ rowsUpserted: number }>;
};

type TransactionsRepository = {
  upsertTransactions(input: {
    planId: string;
    transactions: YnabDeltaTransactionRecord[];
    syncedAt: string;
  }): Promise<{
    rowsUpserted: number;
    rowsDeleted: number;
  }>;
};

type MoneyMovementClient = {
  listMoneyMovementGroups(planId: string): Promise<{
    moneyMovementGroups: YnabMoneyMovementGroup[];
    serverKnowledge: number;
  }>;
  listMoneyMovements(planId: string): Promise<{
    moneyMovements: YnabMoneyMovement[];
    serverKnowledge: number;
  }>;
};

export type ReadModelSyncServiceOptions = {
  deltaClient: YnabDeltaClient;
  syncStateRepository: SyncStateRepository;
  readModelRepository: ReadModelRepository;
  transactionsRepository: TransactionsRepository;
  moneyMovementClient?: MoneyMovementClient;
  maxRowsPerRun: number;
  leaseSeconds?: number;
};

export type SyncReadModelInput = {
  planId: string;
  leaseOwner: string;
  now: string;
};

type EndpointResult = {
  endpoint: string;
  status: "ok" | "skipped" | "failed";
  reason?: string;
  rowsUpserted?: number;
  rowsDeleted?: number;
  serverKnowledge?: number;
};

type EndpointConfig<TRecord> = {
  endpoint: string;
  fetchDelta(planId: string, serverKnowledge: number | undefined): Promise<YnabDeltaResponse<TRecord>>;
  write(input: {
    planId: string;
    records: TRecord[];
    syncedAt: string;
  }): Promise<{ rowsUpserted: number; rowsDeleted?: number }>;
};

type MoneyMovementDeltaRecord = {
  moneyMovementGroups: YnabMoneyMovementGroup[];
  moneyMovements: YnabMoneyMovement[];
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Read-model sync failed.";
}

function countCategoryRows(categoryGroups: YnabCategoryGroupSummary[]) {
  return categoryGroups.length
    + categoryGroups.reduce((sum, group) => sum + group.categories.length, 0);
}

function countMonthRows(months: YnabPlanMonthDetail[]) {
  return months.length
    + months.reduce((sum, month) => sum + (month.categories?.length ?? 0), 0);
}

export function createReadModelSyncService(options: ReadModelSyncServiceOptions) {
  const leaseSeconds = options.leaseSeconds ?? 60;
  const endpointConfigs: Array<EndpointConfig<unknown>> = [
    {
      endpoint: "accounts",
      fetchDelta: options.deltaClient.listAccountsDelta,
      async write(input) {
        return options.readModelRepository.upsertAccounts({
          accounts: input.records as YnabAccountSummary[],
          planId: input.planId,
          syncedAt: input.syncedAt
        });
      }
    },
    {
      endpoint: "categories",
      fetchDelta: options.deltaClient.listCategoriesDelta,
      async write(input) {
        const categoryGroups = input.records as YnabCategoryGroupSummary[];
        const result = await options.readModelRepository.upsertCategoryGroups({
          categoryGroups,
          planId: input.planId,
          syncedAt: input.syncedAt
        });

        return {
          rowsUpserted: result.categoryGroupsUpserted + result.categoriesUpserted
        };
      }
    },
    {
      endpoint: "months",
      fetchDelta: options.deltaClient.listMonthsDelta,
      async write(input) {
        const result = await options.readModelRepository.upsertMonths({
          months: input.records as YnabPlanMonthDetail[],
          planId: input.planId,
          syncedAt: input.syncedAt
        });

        return {
          rowsUpserted: result.monthsUpserted + result.monthCategoriesUpserted
        };
      }
    },
    ...(options.moneyMovementClient
      ? [
          {
            endpoint: "money_movements",
            async fetchDelta(planId: string) {
              const [movements, groups] = await Promise.all([
                options.moneyMovementClient!.listMoneyMovements(planId),
                options.moneyMovementClient!.listMoneyMovementGroups(planId)
              ]);

              return {
                records: [
                  {
                    moneyMovementGroups: groups.moneyMovementGroups,
                    moneyMovements: movements.moneyMovements
                  }
                ],
                serverKnowledge: Math.max(movements.serverKnowledge, groups.serverKnowledge)
              };
            },
            async write(input: {
              planId: string;
              records: unknown[];
              syncedAt: string;
            }) {
              const [record] = input.records as MoneyMovementDeltaRecord[];
              const movementGroupsResult = await options.readModelRepository.upsertMoneyMovementGroups({
                moneyMovementGroups: record.moneyMovementGroups,
                planId: input.planId,
                syncedAt: input.syncedAt
              });
              const movementsResult = await options.readModelRepository.upsertMoneyMovements({
                moneyMovements: record.moneyMovements,
                planId: input.planId,
                syncedAt: input.syncedAt
              });

              return {
                rowsUpserted: movementGroupsResult.rowsUpserted + movementsResult.rowsUpserted
              };
            }
          } satisfies EndpointConfig<unknown>
        ]
      : []),
    {
      endpoint: "payees",
      fetchDelta: options.deltaClient.listPayeesDelta,
      async write(input) {
        return options.readModelRepository.upsertPayees({
          payees: input.records as YnabPayee[],
          planId: input.planId,
          syncedAt: input.syncedAt
        });
      }
    },
    {
      endpoint: "payee_locations",
      fetchDelta: options.deltaClient.listPayeeLocationsDelta,
      async write(input) {
        return options.readModelRepository.upsertPayeeLocations({
          locations: input.records as YnabPayeeLocation[],
          planId: input.planId,
          syncedAt: input.syncedAt
        });
      }
    },
    {
      endpoint: "scheduled_transactions",
      fetchDelta: options.deltaClient.listScheduledTransactionsDelta,
      async write(input) {
        return options.readModelRepository.upsertScheduledTransactions({
          planId: input.planId,
          scheduledTransactions: input.records as YnabScheduledTransaction[],
          syncedAt: input.syncedAt
        });
      }
    },
    {
      endpoint: "transactions",
      fetchDelta: options.deltaClient.listTransactionsDelta,
      async write(input) {
        return options.transactionsRepository.upsertTransactions({
          planId: input.planId,
          syncedAt: input.syncedAt,
          transactions: input.records as YnabDeltaTransactionRecord[]
        });
      }
    }
  ];

  function getRowCount(endpoint: string, records: unknown[]) {
    if (endpoint === "categories") {
      return countCategoryRows(records as YnabCategoryGroupSummary[]);
    }

    if (endpoint === "months") {
      return countMonthRows(records as YnabPlanMonthDetail[]);
    }

    if (endpoint === "money_movements") {
      const [record] = records as MoneyMovementDeltaRecord[];

      return record.moneyMovementGroups.length + record.moneyMovements.length;
    }

    return records.length;
  }

  async function syncEndpoint(input: SyncReadModelInput, config: EndpointConfig<unknown>): Promise<EndpointResult> {
    const lease = await options.syncStateRepository.acquireLease({
      endpoint: config.endpoint,
      leaseOwner: input.leaseOwner,
      leaseSeconds,
      now: input.now,
      planId: input.planId
    });

    if (!lease.acquired) {
      return {
        endpoint: config.endpoint,
        reason: lease.reason,
        status: "skipped"
      };
    }

    const previousServerKnowledge = await options.syncStateRepository.getServerKnowledge(input.planId, config.endpoint);

    try {
      const delta = await config.fetchDelta(input.planId, previousServerKnowledge ?? undefined);
      const rowCount = getRowCount(config.endpoint, delta.records);

      if (rowCount > options.maxRowsPerRun) {
        const error = `Delta response contained ${rowCount} rows, exceeding the configured limit of ${options.maxRowsPerRun}.`;
        await options.syncStateRepository.recordFailure({
          endpoint: config.endpoint,
          error,
          leaseOwner: input.leaseOwner,
          now: input.now,
          planId: input.planId
        });

        return {
          endpoint: config.endpoint,
          reason: "row_limit_exceeded",
          status: "failed"
        };
      }

      const writeResult = await config.write({
        planId: input.planId,
        records: delta.records,
        syncedAt: input.now
      });
      const rowsDeleted = writeResult.rowsDeleted ?? 0;
      const cursorResult = await options.syncStateRepository.advanceCursor({
        endpoint: config.endpoint,
        leaseOwner: input.leaseOwner,
        now: input.now,
        planId: input.planId,
        previousServerKnowledge,
        rowsDeleted,
        rowsUpserted: writeResult.rowsUpserted,
        serverKnowledge: delta.serverKnowledge
      });

      if (!cursorResult.advanced) {
        return {
          endpoint: config.endpoint,
          reason: cursorResult.reason,
          status: "failed"
        };
      }

      return {
        endpoint: config.endpoint,
        rowsDeleted,
        rowsUpserted: writeResult.rowsUpserted,
        serverKnowledge: delta.serverKnowledge,
        status: "ok"
      };
    } catch (error) {
      const message = toErrorMessage(error);
      await options.syncStateRepository.recordFailure({
        endpoint: config.endpoint,
        error: message,
        leaseOwner: input.leaseOwner,
        now: input.now,
        planId: input.planId
      });

      return {
        endpoint: config.endpoint,
        reason: message,
        status: "failed"
      };
    }
  }

  return {
    async syncReadModel(input: SyncReadModelInput) {
      const endpointResults: EndpointResult[] = [];

      for (const config of endpointConfigs) {
        endpointResults.push(await syncEndpoint(input, config));
      }

      return {
        endpointResults,
        status: endpointResults.some((result) => result.status === "failed") ? "failed" as const : "ok" as const
      };
    }
  };
}
