export type StartEndpointRunInput = {
  id: string;
  planId: string;
  endpoint: string;
  startedAt: string;
  serverKnowledgeBefore: number | null;
};

export type FinishEndpointRunInput = {
  id: string;
  finishedAt: string;
  status: "ok" | "failed";
  serverKnowledgeAfter: number | null;
  rowsUpserted: number;
  rowsDeleted: number;
  error: string | null;
};

export function createSyncRunRepository(database: D1Database) {
  return {
    async startEndpointRun(input: StartEndpointRunInput) {
      await database
        .prepare(
          `INSERT INTO ynab_sync_runs (
             id,
             plan_id,
             endpoint,
             started_at,
             status,
             server_knowledge_before
           )
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          input.id,
          input.planId,
          input.endpoint,
          input.startedAt,
          "running",
          input.serverKnowledgeBefore,
        )
        .run();
    },

    async finishEndpointRun(input: FinishEndpointRunInput) {
      await database
        .prepare(
          `UPDATE ynab_sync_runs
           SET finished_at = ?,
               status = ?,
               server_knowledge_after = ?,
               rows_upserted = ?,
               rows_deleted = ?,
               error = ?
           WHERE id = ?`,
        )
        .bind(
          input.finishedAt,
          input.status,
          input.serverKnowledgeAfter,
          input.rowsUpserted,
          input.rowsDeleted,
          input.error,
          input.id,
        )
        .run();
    },
  };
}
