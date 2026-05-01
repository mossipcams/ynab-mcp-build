import { YnabClientError } from "../client.js";
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

type SyncRunRepository = {
  startEndpointRun(input: {
    id: string;
    planId: string;
    endpoint: string;
    startedAt: string;
    serverKnowledgeBefore: number | null;
  }): Promise<void>;
  finishEndpointRun(input: {
    id: string;
    finishedAt: string;
    status: "ok" | "failed";
    serverKnowledgeAfter: number | null;
    rowsUpserted: number;
    rowsDeleted: number;
    error: string | null;
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
  listMoneyMovementGroups(
    planId: string,
    serverKnowledge?: number,
  ): Promise<{
    moneyMovementGroups: YnabMoneyMovementGroup[];
    serverKnowledge: number;
  }>;
  listMoneyMovements(
    planId: string,
    serverKnowledge?: number,
  ): Promise<{
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
  syncRunRepository?: SyncRunRepository;
  readModelRepository: ReadModelRepository;
  transactionsRepository: TransactionsRepository;
  metadataClient?: MetadataClient;
  moneyMovementClient?: MoneyMovementClient;
  leaseSeconds?: number;
};

export type ReadModelSyncProfile = "full" | "hot_financial" | "reference";

export type SyncReadModelInput = {
  planId: string;
  leaseOwner: string;
  now: string;
  profile?: ReadModelSyncProfile;
};

type EndpointResult = {
  endpoint: string;
  status: "ok" | "skipped" | "failed";
  reason?: string;
  rowsUpserted?: number;
  rowsDeleted?: number;
  serverKnowledge?: number;
};

type EndpointRunResult = EndpointResult & {
  shouldStopRun?: boolean;
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

const syncProfileEndpoints: Record<
  ReadModelSyncProfile,
  readonly string[] | null
> = {
  full: null,
  hot_financial: [
    "accounts",
    "categories",
    "months",
    "scheduled_transactions",
    "transactions",
  ],
  reference: [
    "users",
    "plans",
    "plan_settings",
    "money_movements",
    "payees",
    "payee_locations",
  ],
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Read-model sync failed.";
}

function shouldStopRunAfterError(error: unknown) {
  return (
    error instanceof YnabClientError &&
    (error.category === "auth" ||
      error.category === "not_found" ||
      error.category === "rate_limit")
  );
}

function resolveLeaseSeconds(input: {
  configuredLeaseSeconds?: number;
  profile: ReadModelSyncProfile;
}) {
  if (input.configuredLeaseSeconds !== undefined) {
    return input.configuredLeaseSeconds;
  }

  switch (input.profile) {
    case "full":
      return 300;
    case "reference":
      return 120;
    case "hot_financial":
      return 60;
  }
}

async function ignoreRunHistoryFailure(operation: Promise<void>) {
  try {
    await operation;
  } catch {
    // Run history is diagnostic; cursor safety is owned by sync state updates.
  }
}

export function createReadModelSyncService(
  options: ReadModelSyncServiceOptions,
) {
  function defineEndpoint<TRecord>(config: EndpointConfig<TRecord>) {
    return {
      endpoint: config.endpoint,
      sync(input: SyncReadModelInput, leaseSeconds: number) {
        return syncEndpoint(input, config, leaseSeconds);
      },
    };
  }

  const metadataClient = options.metadataClient;
  const moneyMovementClient = options.moneyMovementClient;
  const metadataEndpointConfigs = metadataClient
    ? [
        defineEndpoint<YnabUser>({
          endpoint: "users",
          async fetchDelta(_planId, serverKnowledge) {
            return {
              records: [await metadataClient.getUser()],
              serverKnowledge: serverKnowledge ?? 0,
            };
          },
          async write(input) {
            const [user] = input.records;

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
        }),
        defineEndpoint<PlansMetadataRecord>({
          endpoint: "plans",
          async fetchDelta(planId, serverKnowledge) {
            const [planList, plan] = await Promise.all([
              metadataClient.listPlans(),
              metadataClient.getPlan(planId),
            ]);

            return {
              records: [{ plan, plans: planList.plans }],
              serverKnowledge: serverKnowledge ?? 0,
            };
          },
          async write(input) {
            const [record] = input.records;

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

            const plansResult = await options.readModelRepository.upsertPlans({
              plans: record.plans,
              syncedAt: input.syncedAt,
            });
            const planResult =
              await options.readModelRepository.upsertPlanDetail({
                plan: record.plan,
                syncedAt: input.syncedAt,
              });

            return {
              rowsUpserted: plansResult.rowsUpserted + planResult.rowsUpserted,
            };
          },
        }),
        defineEndpoint<YnabPlanSettings>({
          endpoint: "plan_settings",
          async fetchDelta(planId, serverKnowledge) {
            return {
              records: [await metadataClient.getPlanSettings(planId)],
              serverKnowledge: serverKnowledge ?? 0,
            };
          },
          async write(input) {
            const [settings] = input.records;

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
        }),
      ]
    : [];
  const moneyMovementEndpointConfigs = moneyMovementClient
    ? [
        defineEndpoint<MoneyMovementDeltaRecord>({
          endpoint: "money_movements",
          async fetchDelta(planId, serverKnowledge) {
            const [movements, groups] = await Promise.all([
              moneyMovementClient.listMoneyMovements(planId, serverKnowledge),
              moneyMovementClient.listMoneyMovementGroups(
                planId,
                serverKnowledge,
              ),
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
          async write(input) {
            const [record] = input.records;

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
        }),
      ]
    : [];
  const endpointConfigs = [
    ...metadataEndpointConfigs,
    defineEndpoint<YnabAccountSummary>({
      endpoint: "accounts",
      fetchDelta: (planId, serverKnowledge) =>
        options.deltaClient.listAccountsDelta(planId, serverKnowledge),
      async write(input) {
        return options.readModelRepository.upsertAccounts({
          accounts: input.records,
          planId: input.planId,
          syncedAt: input.syncedAt,
        });
      },
    }),
    defineEndpoint<YnabCategoryGroupSummary>({
      endpoint: "categories",
      fetchDelta: (planId, serverKnowledge) =>
        options.deltaClient.listCategoriesDelta(planId, serverKnowledge),
      async write(input) {
        const result = await options.readModelRepository.upsertCategoryGroups({
          categoryGroups: input.records,
          planId: input.planId,
          syncedAt: input.syncedAt,
        });

        return {
          rowsUpserted:
            result.categoryGroupsUpserted + result.categoriesUpserted,
        };
      },
    }),
    defineEndpoint<YnabPlanMonthDetail>({
      endpoint: "months",
      fetchDelta: (planId, serverKnowledge) =>
        options.deltaClient.listMonthsDelta(planId, serverKnowledge),
      async write(input) {
        const result = await options.readModelRepository.upsertMonths({
          months: input.records,
          planId: input.planId,
          syncedAt: input.syncedAt,
        });

        return {
          rowsUpserted: result.monthsUpserted + result.monthCategoriesUpserted,
        };
      },
    }),
    ...moneyMovementEndpointConfigs,
    defineEndpoint<YnabPayee>({
      endpoint: "payees",
      fetchDelta: (planId, serverKnowledge) =>
        options.deltaClient.listPayeesDelta(planId, serverKnowledge),
      async write(input) {
        return options.readModelRepository.upsertPayees({
          payees: input.records,
          planId: input.planId,
          syncedAt: input.syncedAt,
        });
      },
    }),
    defineEndpoint<YnabPayeeLocation>({
      endpoint: "payee_locations",
      fetchDelta: (planId, serverKnowledge) =>
        options.deltaClient.listPayeeLocationsDelta(planId, serverKnowledge),
      async write(input) {
        return options.readModelRepository.upsertPayeeLocations({
          locations: input.records,
          planId: input.planId,
          syncedAt: input.syncedAt,
        });
      },
    }),
    defineEndpoint<YnabScheduledTransaction>({
      endpoint: "scheduled_transactions",
      fetchDelta: (planId, serverKnowledge) =>
        options.deltaClient.listScheduledTransactionsDelta(
          planId,
          serverKnowledge,
        ),
      async write(input) {
        return options.readModelRepository.upsertScheduledTransactions({
          planId: input.planId,
          scheduledTransactions: input.records,
          syncedAt: input.syncedAt,
        });
      },
    }),
    defineEndpoint<YnabDeltaTransactionRecord>({
      endpoint: "transactions",
      fetchDelta: (planId, serverKnowledge) =>
        options.deltaClient.listTransactionsDelta(planId, serverKnowledge),
      async write(input) {
        return options.transactionsRepository.upsertTransactions({
          planId: input.planId,
          syncedAt: input.syncedAt,
          transactions: input.records,
        });
      },
    }),
  ];

  async function syncEndpoint<TRecord>(
    input: SyncReadModelInput,
    config: EndpointConfig<TRecord>,
    leaseSeconds: number,
  ): Promise<EndpointRunResult> {
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
    const runId = `${input.leaseOwner}:${config.endpoint}`;

    if (options.syncRunRepository) {
      await ignoreRunHistoryFailure(
        options.syncRunRepository.startEndpointRun({
          endpoint: config.endpoint,
          id: runId,
          planId: input.planId,
          serverKnowledgeBefore: previousServerKnowledge,
          startedAt: input.now,
        }),
      );
    }

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
        if (options.syncRunRepository) {
          await ignoreRunHistoryFailure(
            options.syncRunRepository.finishEndpointRun({
              error: cursorResult.reason,
              finishedAt: input.now,
              id: runId,
              rowsDeleted,
              rowsUpserted: writeResult.rowsUpserted,
              serverKnowledgeAfter: delta.serverKnowledge,
              status: "failed",
            }),
          );
        }

        return {
          endpoint: config.endpoint,
          reason: cursorResult.reason,
          status: "failed",
        };
      }

      if (options.syncRunRepository) {
        await ignoreRunHistoryFailure(
          options.syncRunRepository.finishEndpointRun({
            error: null,
            finishedAt: input.now,
            id: runId,
            rowsDeleted,
            rowsUpserted: writeResult.rowsUpserted,
            serverKnowledgeAfter: delta.serverKnowledge,
            status: "ok",
          }),
        );
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

      if (options.syncRunRepository) {
        await ignoreRunHistoryFailure(
          options.syncRunRepository.finishEndpointRun({
            error: message,
            finishedAt: input.now,
            id: runId,
            rowsDeleted: 0,
            rowsUpserted: 0,
            serverKnowledgeAfter: null,
            status: "failed",
          }),
        );
      }

      return {
        endpoint: config.endpoint,
        reason: message,
        shouldStopRun: shouldStopRunAfterError(error),
        status: "failed",
      };
    }
  }

  return {
    async syncReadModel(input: SyncReadModelInput) {
      const endpointResults: EndpointResult[] = [];
      const profile = input.profile ?? "full";
      const leaseSeconds = resolveLeaseSeconds({
        ...(options.leaseSeconds !== undefined
          ? { configuredLeaseSeconds: options.leaseSeconds }
          : {}),
        profile,
      });
      const profileEndpoints = syncProfileEndpoints[profile];
      const selectedEndpointConfigs = profileEndpoints
        ? endpointConfigs.filter((config) =>
            profileEndpoints.includes(config.endpoint),
          )
        : endpointConfigs;

      for (const config of selectedEndpointConfigs) {
        const result = await config.sync(input, leaseSeconds);
        const { shouldStopRun, ...endpointResult } = result;

        endpointResults.push(endpointResult);

        if (shouldStopRun) {
          break;
        }
      }

      return {
        endpointResults,
        profile,
        status: endpointResults.some((result) => result.status === "failed")
          ? ("failed" as const)
          : ("ok" as const),
      };
    },
  };
}
