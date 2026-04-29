export type AcquireLeaseInput = {
  planId: string;
  endpoint: string;
  leaseOwner: string;
  leaseSeconds: number;
  now: string;
};

export type AdvanceCursorInput = {
  planId: string;
  endpoint: string;
  leaseOwner: string;
  previousServerKnowledge: number | null;
  serverKnowledge: number;
  rowsUpserted: number;
  rowsDeleted: number;
  now: string;
};

export type RecordFailureInput = {
  planId: string;
  endpoint: string;
  leaseOwner: string;
  error: string;
  now: string;
};

type LeaseRow = {
  lease_owner?: string | null;
  lease_expires_at?: string | null;
};

type ServerKnowledgeRow = {
  server_knowledge?: number | null;
};

function addSeconds(isoDate: string, seconds: number) {
  return new Date(new Date(isoDate).getTime() + seconds * 1000).toISOString();
}

function getChangeCount(result: D1Result) {
  const meta = result.meta as { changes?: number } | undefined;

  return meta?.changes ?? 0;
}

export function createSyncStateRepository(database: D1Database) {
  return {
    async getServerKnowledge(planId: string, endpoint: string) {
      const row = await database
        .prepare(
          `SELECT server_knowledge
           FROM ynab_sync_state
           WHERE plan_id = ? AND endpoint = ?`,
        )
        .bind(planId, endpoint)
        .first<ServerKnowledgeRow>();

      return row?.server_knowledge ?? null;
    },

    async acquireLease(input: AcquireLeaseInput) {
      const leaseExpiresAt = addSeconds(input.now, input.leaseSeconds);
      const result = await database
        .prepare(
          `INSERT INTO ynab_sync_state (
             plan_id,
             endpoint,
             health_status,
             lease_owner,
             lease_expires_at,
             created_at,
             updated_at
           )
           VALUES (?, ?, 'never_synced', ?, ?, ?, ?)
           ON CONFLICT(plan_id, endpoint) DO UPDATE SET
             lease_owner = excluded.lease_owner,
             lease_expires_at = excluded.lease_expires_at,
             updated_at = excluded.updated_at
           WHERE ynab_sync_state.lease_owner IS NULL
              OR ynab_sync_state.lease_expires_at IS NULL
              OR ynab_sync_state.lease_expires_at <= ?`,
        )
        .bind(
          input.planId,
          input.endpoint,
          input.leaseOwner,
          leaseExpiresAt,
          input.now,
          input.now,
          input.now,
        )
        .run();

      if (getChangeCount(result) === 0) {
        const currentLease = await database
          .prepare(
            `SELECT lease_owner, lease_expires_at
             FROM ynab_sync_state
             WHERE plan_id = ? AND endpoint = ?`,
          )
          .bind(input.planId, input.endpoint)
          .first<LeaseRow>();

        if (
          currentLease?.lease_owner &&
          currentLease.lease_expires_at &&
          currentLease.lease_expires_at > input.now
        ) {
          return {
            acquired: false as const,
            reason: "lease_active" as const,
          };
        }

        return {
          acquired: false as const,
          reason: "contention" as const,
        };
      }

      return {
        acquired: true as const,
        leaseExpiresAt,
      };
    },

    async advanceCursor(input: AdvanceCursorInput) {
      const cursorPredicate =
        input.previousServerKnowledge === null
          ? "server_knowledge IS NULL"
          : "server_knowledge = ?";
      const params = [
        input.serverKnowledge,
        input.now,
        input.rowsUpserted,
        input.rowsDeleted,
        input.now,
        input.planId,
        input.endpoint,
        input.leaseOwner,
        ...(input.previousServerKnowledge === null
          ? []
          : [input.previousServerKnowledge]),
      ];
      const result = await database
        .prepare(
          `UPDATE ynab_sync_state
           SET server_knowledge = ?,
               last_successful_sync_at = ?,
               health_status = 'ok',
               last_error = NULL,
               rows_upserted_last_run = ?,
               rows_deleted_last_run = ?,
               lease_owner = NULL,
               lease_expires_at = NULL,
               updated_at = ?
           WHERE plan_id = ?
             AND endpoint = ?
             AND lease_owner = ?
             AND ${cursorPredicate}`,
        )
        .bind(...params)
        .run();

      if (getChangeCount(result) === 0) {
        return {
          advanced: false as const,
          reason: "contention" as const,
        };
      }

      return {
        advanced: true as const,
      };
    },

    async recordFailure(input: RecordFailureInput) {
      await database
        .prepare(
          `UPDATE ynab_sync_state
           SET last_failed_sync_at = ?,
               health_status = 'unhealthy',
               last_error = ?,
               lease_owner = NULL,
               lease_expires_at = NULL,
               updated_at = ?
           WHERE plan_id = ?
             AND endpoint = ?
             AND lease_owner = ?`,
        )
        .bind(
          input.now,
          input.error,
          input.now,
          input.planId,
          input.endpoint,
          input.leaseOwner,
        )
        .run();
    },
  };
}
