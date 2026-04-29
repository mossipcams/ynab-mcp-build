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

function subtractMinutes(isoDate: string, minutes: number) {
  return new Date(new Date(isoDate).getTime() - minutes * 60_000).toISOString();
}

export function createReadModelFreshness(
  database: D1Database,
  options: {
    now: () => string;
    staleAfterMinutes: number;
  },
) {
  return {
    async getFreshness(
      planId: string,
      requiredEndpoints: readonly string[],
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
      const rows = result.results ?? [];
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

      return {
        health_status: "ok",
        last_synced_at: oldestLastSyncedAt,
        stale,
        warning: stale
          ? "Data is stale relative to the configured freshness window."
          : null,
      };
    },
  };
}
