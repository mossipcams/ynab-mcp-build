type BackfillMonthEnv = {
  YNAB_ACCESS_TOKEN?: string;
  YNAB_API_BASE_URL?: string;
};

type BackfillMonthDependencies = {
  backfillPlanMonth(input: {
    month: string;
    planId: string;
    readModelRepository: unknown;
    syncedAt: string;
    ynabClient: unknown;
  }): Promise<unknown>;
  createReadModelSyncRepository(database: D1Database): unknown;
  createYnabClient(input: { accessToken: string; baseUrl: string }): unknown;
  now: () => string;
};

type ExecuteMonthBackfillInput = {
  args: readonly string[];
  database: D1Database | undefined;
  dependencies: BackfillMonthDependencies;
  env: BackfillMonthEnv;
};

const DEFAULT_YNAB_API_BASE_URL = "https://api.ynab.com/v1";

function getFlagValue(args: readonly string[], flag: string) {
  const index = args.indexOf(flag);

  if (index === -1) {
    return undefined;
  }

  const value = args[index + 1];

  return value && !value.startsWith("--") ? value : undefined;
}

export async function executeMonthBackfill(input: ExecuteMonthBackfillInput) {
  const planId = getFlagValue(input.args, "--plan-id")?.trim();
  const month = getFlagValue(input.args, "--month")?.trim();

  if (!planId || !month) {
    throw new Error("Backfill month requires --plan-id and --month arguments.");
  }

  if (!input.env.YNAB_ACCESS_TOKEN) {
    throw new Error("YNAB_ACCESS_TOKEN is required to backfill a month.");
  }

  if (!input.database) {
    throw new Error("YNAB_DB binding is required to backfill a month.");
  }

  const ynabClient = input.dependencies.createYnabClient({
    accessToken: input.env.YNAB_ACCESS_TOKEN,
    baseUrl: input.env.YNAB_API_BASE_URL ?? DEFAULT_YNAB_API_BASE_URL,
  });
  const readModelRepository = input.dependencies.createReadModelSyncRepository(
    input.database,
  );

  return input.dependencies.backfillPlanMonth({
    month,
    planId,
    readModelRepository,
    syncedAt: input.dependencies.now(),
    ynabClient,
  });
}
