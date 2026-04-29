import { createYnabClient, type YnabClient } from "../platform/ynab/client.js";
import { createYnabDeltaClient } from "../platform/ynab/delta-client.js";
import { createReadModelSyncRepository } from "../platform/ynab/read-model/read-model-sync-repository.js";
import { createReadModelSyncService, type SyncReadModelInput } from "../platform/ynab/read-model/read-model-sync-service.js";
import { createSyncStateRepository } from "../platform/ynab/read-model/sync-state-repository.js";
import { createTransactionsRepository } from "../platform/ynab/read-model/transactions-repository.js";
import { resolveAppEnv } from "../shared/env.js";

type ScheduledReadModelSyncResult =
  | Awaited<ReturnType<ReturnType<typeof createReadModelSyncService>["syncReadModel"]>>
  | { status: "failed" | "skipped"; reason: string };

type ScheduledSyncDependencies = {
  createReadModelSyncService?: typeof createReadModelSyncService;
  ynabClient?: Pick<YnabClient, "listPlans">;
};

function resolveScheduledAppEnv(env: Env) {
  return resolveAppEnv({
    ...env,
    MCP_OAUTH_ENABLED: "false"
  } as unknown as Partial<Env>);
}

function createMoneyMovementClient(accessToken: string, baseUrl: string) {
  const client = createYnabClient({
    accessToken,
    baseUrl
  });

  return {
    listMoneyMovementGroups(planId: string) {
      return client.listMoneyMovementGroups(planId);
    },
    listMoneyMovements(planId: string) {
      return client.listMoneyMovements(planId);
    }
  };
}

function createMetadataClient(accessToken: string, baseUrl: string) {
  const client = createYnabClient({
    accessToken,
    baseUrl
  });

  return {
    getPlan(planId: string) {
      return client.getPlan(planId);
    },
    getPlanSettings(planId: string) {
      return client.getPlanSettings(planId);
    },
    getUser() {
      return client.getUser();
    },
    listPlans() {
      return client.listPlans();
    }
  };
}

function createPlanDiscoveryClient(accessToken: string, baseUrl: string) {
  const client = createYnabClient({
    accessToken,
    baseUrl
  });

  return {
    listPlans() {
      return client.listPlans();
    }
  };
}

async function resolveScheduledPlanId(input: {
  accessToken: string;
  baseUrl: string;
  configuredPlanId?: string;
  ynabClient?: Pick<YnabClient, "listPlans">;
}) {
  if (input.configuredPlanId) {
    return input.configuredPlanId;
  }

  const ynabClient = input.ynabClient ?? createPlanDiscoveryClient(input.accessToken, input.baseUrl);
  const planList = await ynabClient.listPlans();

  return planList.defaultPlan?.id ?? planList.plans[0]?.id ?? null;
}

function createProductionReadModelSyncService(env: ReturnType<typeof resolveScheduledAppEnv>) {
  if (!env.ynabAccessToken) {
    return {
      reason: "YNAB_ACCESS_TOKEN is required for scheduled D1 sync.",
      service: null
    };
  }

  if (!env.ynabDatabase) {
    return {
      reason: "YNAB_DB is required for scheduled D1 sync.",
      service: null
    };
  }

  const deltaClient = createYnabDeltaClient({
    accessToken: env.ynabAccessToken,
    baseUrl: env.ynabApiBaseUrl
  });
  const moneyMovementClient = createMoneyMovementClient(env.ynabAccessToken, env.ynabApiBaseUrl);
  const metadataClient = createMetadataClient(env.ynabAccessToken, env.ynabApiBaseUrl);
  const database = env.ynabDatabase;

  return {
    reason: null,
    service: createReadModelSyncService({
      deltaClient,
      maxRowsPerRun: env.ynabSyncMaxRowsPerRun,
      metadataClient,
      moneyMovementClient,
      readModelRepository: createReadModelSyncRepository(database),
      syncStateRepository: createSyncStateRepository(database),
      transactionsRepository: createTransactionsRepository(database)
    })
  };
}

export async function runScheduledReadModelSync(
  env: Env,
  scheduledTime: number,
  dependencies: ScheduledSyncDependencies = {}
): Promise<ScheduledReadModelSyncResult> {
  const appEnv = resolveScheduledAppEnv(env);

  if (appEnv.ynabReadSource !== "d1") {
    return {
      reason: "YNAB_READ_SOURCE is not d1.",
      status: "skipped"
    };
  }

  if (!appEnv.ynabAccessToken) {
    return {
      reason: "YNAB_ACCESS_TOKEN is required for scheduled D1 sync.",
      status: "failed"
    };
  }

  if (!appEnv.ynabDatabase) {
    return {
      reason: "YNAB_DB is required for scheduled D1 sync.",
      status: "failed"
    };
  }

  const planId = await resolveScheduledPlanId({
    accessToken: appEnv.ynabAccessToken,
    baseUrl: appEnv.ynabApiBaseUrl,
    ...(appEnv.ynabDefaultPlanId ? { configuredPlanId: appEnv.ynabDefaultPlanId } : {}),
    ...(dependencies.ynabClient ? { ynabClient: dependencies.ynabClient } : {})
  });

  if (!planId) {
    return {
      reason: "No YNAB default plan was available for scheduled D1 sync.",
      status: "failed"
    };
  }

  const service = dependencies.createReadModelSyncService
    ? dependencies.createReadModelSyncService({
      deltaClient: createYnabDeltaClient({
        accessToken: appEnv.ynabAccessToken,
        baseUrl: appEnv.ynabApiBaseUrl
      }),
      maxRowsPerRun: appEnv.ynabSyncMaxRowsPerRun,
      metadataClient: createMetadataClient(appEnv.ynabAccessToken, appEnv.ynabApiBaseUrl),
      moneyMovementClient: createMoneyMovementClient(appEnv.ynabAccessToken, appEnv.ynabApiBaseUrl),
      readModelRepository: createReadModelSyncRepository(appEnv.ynabDatabase),
      syncStateRepository: createSyncStateRepository(appEnv.ynabDatabase),
      transactionsRepository: createTransactionsRepository(appEnv.ynabDatabase)
    })
    : createProductionReadModelSyncService(appEnv).service;

  if (!service) {
    return {
      reason: "Scheduled D1 sync service could not be created.",
      status: "failed"
    };
  }

  const input: SyncReadModelInput = {
    leaseOwner: `scheduled:${scheduledTime}`,
    now: new Date(scheduledTime).toISOString(),
    planId
  };

  return service.syncReadModel(input);
}

export async function runScheduledReadModelSyncAndReport(
  env: Env,
  scheduledTime: number,
  dependencies: ScheduledSyncDependencies = {}
): Promise<ScheduledReadModelSyncResult> {
  const result = await runScheduledReadModelSync(env, scheduledTime, dependencies);

  if (result.status === "failed") {
    const detail = "reason" in result
      ? result.reason
      : result.endpointResults
        .filter((endpointResult) => endpointResult.status === "failed")
        .map((endpointResult) => `${endpointResult.endpoint}: ${endpointResult.reason ?? "failed"}`)
        .join("; ");

    throw new Error(`Scheduled D1 sync failed: ${detail || "unknown failure"}.`);
  }

  return result;
}
