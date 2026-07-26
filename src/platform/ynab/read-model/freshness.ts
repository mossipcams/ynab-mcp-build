import { createReadModelIntegrity } from "./integrity.js";

export type EndpointFreshness = {
  last_synced_at: string | null;
  stale: boolean;
  health_status: string;
  warning: string | null;
};

type SyncStateRow = {
  endpoint: string;
  health_status: string;
  last_successful_sync_at?: string | null;
  last_failed_sync_at?: string | null;
  last_error?: string | null;
};

type FreshnessContext = {
  month?: string;
};

const rowsOrEmpty = <T>(result: { results?: T[] }) => result.results ?? [];

function subtractMinutes(isoDate: string, minutes: number) {
  return new Date(new Date(isoDate).getTime() - minutes * 60_000).toISOString();
}

// Month inputs reach here as an explicit `YYYY-MM-DD`, the literal "current",
// or not at all. The latter two both mean the current calendar month, which is
// what the slice services resolve an omitted month to. Anything that does not
// normalize to a stored `YYYY-MM-01` key would silently match zero rows and
// report healthy, so always resolve to a real month key.
function toIntegrityMonth(month: string | undefined, nowIso: string) {
  const source = month && month !== "current" ? month : nowIso;

  return `${source.slice(0, 7)}-01`;
}

export function createReadModelFreshness(
  database: D1Database,
  options: {
    now: () => string;
    staleAfterMinutes: number;
  },
) {
  const integrity = createReadModelIntegrity(database);

  return {
    async getFreshness(
      planId: string,
      requiredEndpoints: readonly string[],
      context?: FreshnessContext,
    ): Promise<EndpointFreshness> {
      if (requiredEndpoints.length === 0) {
        return {
          health_status: "ok",
          last_synced_at: null,
          stale: false,
          warning: null,
        };
      }

      const placeholders = requiredEndpoints.map(() => "?").join(", ");
      const result = await database
        .prepare(
          `SELECT endpoint, health_status, last_successful_sync_at, last_failed_sync_at, last_error
           FROM ynab_sync_state
           WHERE plan_id = ? AND endpoint IN (${placeholders})`,
        )
        .bind(planId, ...requiredEndpoints)
        .all<SyncStateRow>();
      const rows = rowsOrEmpty(result);
      const rowsByEndpoint = new Map(rows.map((row) => [row.endpoint, row]));
      const missingEndpoint = requiredEndpoints.find(
        (endpoint) => !rowsByEndpoint.has(endpoint),
      );

      if (missingEndpoint) {
        return {
          health_status: "never_synced",
          last_synced_at: null,
          stale: true,
          warning: `Required endpoint ${missingEndpoint} has never synced.`,
        };
      }

      const unhealthy = rows.find((row) => row.health_status === "unhealthy");
      const lastSyncedValues = rows
        .map((row) => row.last_successful_sync_at)
        .filter(
          (value): value is string =>
            typeof value === "string" && value.length > 0,
        )
        .sort();
      const oldestLastSyncedAt = lastSyncedValues[0] ?? null;

      if (unhealthy) {
        return {
          health_status: "unhealthy",
          last_synced_at: oldestLastSyncedAt,
          stale: true,
          warning:
            unhealthy.last_error ??
            `Required endpoint ${unhealthy.endpoint} is unhealthy.`,
        };
      }

      const staleBefore = subtractMinutes(
        options.now(),
        options.staleAfterMinutes,
      );
      const stale = !oldestLastSyncedAt || oldestLastSyncedAt < staleBefore;
      const monthIntegrity = requiredEndpoints.includes("months")
        ? await integrity.getMonthCategoryIntegrity({
            month: toIntegrityMonth(context?.month, options.now()),
            planId,
          })
        : null;

      if (monthIntegrity?.health_status === "unhealthy") {
        return {
          health_status: "unhealthy",
          last_synced_at: oldestLastSyncedAt,
          stale: true,
          warning: monthIntegrity.warning,
        };
      }

      const staleWarning = stale
        ? "Data is stale relative to the configured freshness window."
        : null;

      return {
        health_status: "ok",
        last_synced_at: oldestLastSyncedAt,
        stale,
        warning: monthIntegrity?.warning ?? staleWarning,
      };
    },
  };
}
