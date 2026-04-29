import type {
  YnabAccountSummary,
  YnabCategoryGroupSummary,
  YnabMoneyMovement,
  YnabMoneyMovementGroup,
  YnabPayee,
  YnabPayeeLocation,
  YnabPlanDetail,
  YnabPlanList,
  YnabPlanMonthDetail,
  YnabPlanSettings,
  YnabUser,
  YnabScheduledTransaction,
} from "../client.js";
import type {
  YnabDeltaClient,
  YnabDeltaResponse,
  YnabDeltaTransactionRecord,
} from "../delta-client.js";

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
  }): Promise<{ advanced: true } | { advanced: false; reason: "contention" }>;
  recordFailure(input: {
    planId: string;
    endpoint: string;
    leaseOwner: string;
    error: string;
    now: string;
  }): Promise<void>;
};

type ReadModelRepository = {
  upsertUser?(input: {
    user: YnabUser;
    syncedAt: string;
  }): Promise<{ rowsUpserted: number }>;
  upsertPlans?(input: {
    plans: YnabPlanList["plans"];
    syncedAt: string;
  }): Promise<{ rowsUpserted: number }>;
  upsertPlanDetail?(input: {
    plan: YnabPlanDetail;
    syncedAt: string;
  }): Promise<{ rowsUpserted: number }>;
  upsertPlanSettings?(input: {
    planId: string;
    settings: YnabPlanSettings;
    syncedAt: string;
  }): Promise<{ rowsUpserted: number }>;
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

type MetadataClient = {
  getUser(): Promise<YnabUser>;
  listPlans(): Promise<YnabPlanList>;
  getPlan(planId: string): Promise<YnabPlanDetail>;
  getPlanSettings(planId: string): Promise<YnabPlanSettings>;
};

export type ReadModelSyncServiceOptions = {
  deltaClient: YnabDeltaClient;
  syncStateRepository: SyncStateRepository;
  readModelRepository: ReadModelRepository;
  transactionsRepository: TransactionsRepository;
  metadataClient?: MetadataClient;
  moneyMovementClient?: MoneyMovementClient;
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
  fetchDelta(
    planId: string,
    serverKnowledge: number | undefined,
  ): Promise<YnabDeltaResponse<TRecord>>;
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

type PlansMetadataRecord = {
  plan: YnabPlanDetail;
  plans: YnabPlanList["plans"];
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Read-model sync failed.";
}

export function createReadModelSyncService(
  options: ReadModelSyncServiceOptions,
) {
  const leaseSeconds = options.leaseSeconds ?? 60;
  const endpointConfigs: Array<EndpointConfig<unknown>> = [
    ...(options.metadataClient
      ? [
          {
            endpoint: "users",
            async fetchDelta(
              _planId: string,
              serverKnowledge: number | undefined,
            ) {
              return {
                records: [await options.metadataClient!.getUser()],
                serverKnowledge: serverKnowledge ?? 0,
              };
            },
            async write(input: { records: unknown[]; syncedAt: string }) {
              const [user] = input.records as YnabUser[];

              if (!user) {
                return { rowsUpserted: 0 };
              }

              if (!options.readModelRepository.upsertUser) {
                throw new Error(
                  "Read-model metadata repository is missing upsertUser.",
                );
              }

              return options.readModelRepository.upsertUser({
                syncedAt: input.syncedAt,
                user,
              });
            },
          } satisfies EndpointConfig<unknown>,
          {
            endpoint: "plans",
            async fetchDelta(
              planId: string,
              serverKnowledge: number | undefined,
            ) {
              const [planList, plan] = await Promise.all([
                options.metadataClient!.listPlans(),
                options.metadataClient!.getPlan(planId),
              ]);

              return {
                records: [{ plan, plans: planList.plans }],
                serverKnowledge: serverKnowledge ?? 0,
              };
            },
            async write(input: { records: unknown[]; syncedAt: string }) {
              const [record] = input.records as PlansMetadataRecord[];

              if (!record) {
                return { rowsUpserted: 0 };
              }

              if (
                !options.readModelRepository.upsertPlans ||
                !options.readModelRepository.upsertPlanDetail
              ) {
                throw new Error(
                  "Read-model metadata repository is missing plan upsert methods.",
                );
              }

              const plansResult = await options.readModelRepository.upsertPlans(
                {
                  plans: record.plans,
                  syncedAt: input.syncedAt,
                },
              );
              const planResult =
                await options.readModelRepository.upsertPlanDetail({
                  plan: record.plan,
                  syncedAt: input.syncedAt,
                });

              return {
                rowsUpserted:
                  plansResult.rowsUpserted + planResult.rowsUpserted,
              };
            },
          } satisfies EndpointConfig<unknown>,
          {
            endpoint: "plan_settings",
            async fetchDelta(
              planId: string,
              serverKnowledge: number | undefined,
            ) {
              return {
                records: [
                  await options.metadataClient!.getPlanSettings(planId),
                ],
                serverKnowledge: serverKnowledge ?? 0,
              };
            },
            async write(input: {
              planId: string;
              records: unknown[];
              syncedAt: string;
            }) {
              const [settings] = input.records as YnabPlanSettings[];

              if (!settings) {
                return { rowsUpserted: 0 };
              }

              if (!options.readModelRepository.upsertPlanSettings) {
                throw new Error(
                  "Read-model metadata repository is missing upsertPlanSettings.",
                );
              }

              return options.readModelRepository.upsertPlanSettings({
                planId: input.planId,
                settings,
                syncedAt: input.syncedAt,
              });
            },
          } satisfies EndpointConfig<unknown>,
        ]
      : []),
    {
      endpoint: "accounts",
      fetchDelta: (planId, serverKnowledge) =>
        options.deltaClient.listAccountsDelta(planId, serverKnowledge),
      async write(input) {
        return options.readModelRepository.upsertAccounts({
          accounts: input.records as YnabAccountSummary[],
          planId: input.planId,
          syncedAt: input.syncedAt,
        });
      },
    },
    {
      endpoint: "categories",
      fetchDelta: (planId, serverKnowledge) =>
        options.deltaClient.listCategoriesDelta(planId, serverKnowledge),
      async write(input) {
        const categoryGroups = input.records as YnabCategoryGroupSummary[];
        const result = await options.readModelRepository.upsertCategoryGroups({
          categoryGroups,
          planId: input.planId,
          syncedAt: input.syncedAt,
        });

        return {
          rowsUpserted:
            result.categoryGroupsUpserted + result.categoriesUpserted,
        };
      },
    },
    {
      endpoint: "months",
      fetchDelta: (planId, serverKnowledge) =>
        options.deltaClient.listMonthsDelta(planId, serverKnowledge),
      async write(input) {
        const result = await options.readModelRepository.upsertMonths({
          months: input.records as YnabPlanMonthDetail[],
          planId: input.planId,
          syncedAt: input.syncedAt,
        });

        return {
          rowsUpserted: result.monthsUpserted + result.monthCategoriesUpserted,
        };
      },
    },
    ...(options.moneyMovementClient
      ? [
          {
            endpoint: "money_movements",
            async fetchDelta(planId: string) {
              const [movements, groups] = await Promise.all([
                options.moneyMovementClient!.listMoneyMovements(planId),
                options.moneyMovementClient!.listMoneyMovementGroups(planId),
              ]);

              return {
                records: [
                  {
                    moneyMovementGroups: groups.moneyMovementGroups,
                    moneyMovements: movements.moneyMovements,
                  },
                ],
                serverKnowledge: Math.max(
                  movements.serverKnowledge,
                  groups.serverKnowledge,
                ),
              };
            },
            async write(input: {
              planId: string;
              records: unknown[];
              syncedAt: string;
            }) {
              const [record] = input.records as MoneyMovementDeltaRecord[];

              if (!record) {
                return { rowsUpserted: 0 };
              }

              const movementGroupsResult =
                await options.readModelRepository.upsertMoneyMovementGroups({
                  moneyMovementGroups: record.moneyMovementGroups,
                  planId: input.planId,
                  syncedAt: input.syncedAt,
                });
              const movementsResult =
                await options.readModelRepository.upsertMoneyMovements({
                  moneyMovements: record.moneyMovements,
                  planId: input.planId,
                  syncedAt: input.syncedAt,
                });

              return {
                rowsUpserted:
                  movementGroupsResult.rowsUpserted +
                  movementsResult.rowsUpserted,
              };
            },
          } satisfies EndpointConfig<unknown>,
        ]
      : []),
    {
      endpoint: "payees",
      fetchDelta: (planId, serverKnowledge) =>
        options.deltaClient.listPayeesDelta(planId, serverKnowledge),
      async write(input) {
        return options.readModelRepository.upsertPayees({
          payees: input.records as YnabPayee[],
          planId: input.planId,
          syncedAt: input.syncedAt,
        });
      },
    },
    {
      endpoint: "payee_locations",
      fetchDelta: (planId, serverKnowledge) =>
        options.deltaClient.listPayeeLocationsDelta(planId, serverKnowledge),
      async write(input) {
        return options.readModelRepository.upsertPayeeLocations({
          locations: input.records as YnabPayeeLocation[],
          planId: input.planId,
          syncedAt: input.syncedAt,
        });
      },
    },
    {
      endpoint: "scheduled_transactions",
      fetchDelta: (planId, serverKnowledge) =>
        options.deltaClient.listScheduledTransactionsDelta(
          planId,
          serverKnowledge,
        ),
      async write(input) {
        return options.readModelRepository.upsertScheduledTransactions({
          planId: input.planId,
          scheduledTransactions: input.records as YnabScheduledTransaction[],
          syncedAt: input.syncedAt,
        });
      },
    },
    {
      endpoint: "transactions",
      fetchDelta: (planId, serverKnowledge) =>
        options.deltaClient.listTransactionsDelta(planId, serverKnowledge),
      async write(input) {
        return options.transactionsRepository.upsertTransactions({
          planId: input.planId,
          syncedAt: input.syncedAt,
          transactions: input.records as YnabDeltaTransactionRecord[],
        });
      },
    },
  ];

  async function syncEndpoint(
    input: SyncReadModelInput,
    config: EndpointConfig<unknown>,
  ): Promise<EndpointResult> {
    const lease = await options.syncStateRepository.acquireLease({
      endpoint: config.endpoint,
      leaseOwner: input.leaseOwner,
      leaseSeconds,
      now: input.now,
      planId: input.planId,
    });

    if (!lease.acquired) {
      return {
        endpoint: config.endpoint,
        reason: lease.reason,
        status: "skipped",
      };
    }

    const previousServerKnowledge =
      await options.syncStateRepository.getServerKnowledge(
        input.planId,
        config.endpoint,
      );

    try {
      const delta = await config.fetchDelta(
        input.planId,
        previousServerKnowledge ?? undefined,
      );
      const writeResult = await config.write({
        planId: input.planId,
        records: delta.records,
        syncedAt: input.now,
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
        serverKnowledge: delta.serverKnowledge,
      });

      if (!cursorResult.advanced) {
        return {
          endpoint: config.endpoint,
          reason: cursorResult.reason,
          status: "failed",
        };
      }

      return {
        endpoint: config.endpoint,
        rowsDeleted,
        rowsUpserted: writeResult.rowsUpserted,
        serverKnowledge: delta.serverKnowledge,
        status: "ok",
      };
    } catch (error) {
      const message = toErrorMessage(error);

      try {
        await options.syncStateRepository.recordFailure({
          endpoint: config.endpoint,
          error: message,
          leaseOwner: input.leaseOwner,
          now: input.now,
          planId: input.planId,
        });
      } catch {
        // Preserve the primary endpoint failure result even when failure bookkeeping is unavailable.
      }

      return {
        endpoint: config.endpoint,
        reason: message,
        status: "failed",
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
        status: endpointResults.some((result) => result.status === "failed")
          ? ("failed" as const)
          : ("ok" as const),
      };
    },
  };
}
