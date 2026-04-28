import type { YnabDeltaClient, YnabDeltaTransactionRecord } from "../delta-client.js";

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

export type TransactionSyncServiceOptions = {
  deltaClient: YnabDeltaClient;
  syncStateRepository: SyncStateRepository;
  transactionsRepository: TransactionsRepository;
  maxRowsPerRun: number;
  leaseSeconds?: number;
};

export type SyncTransactionsInput = {
  planId: string;
  leaseOwner: string;
  now: string;
};

const TRANSACTIONS_ENDPOINT = "transactions";

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Transaction sync failed.";
}

export function createTransactionSyncService(options: TransactionSyncServiceOptions) {
  const leaseSeconds = options.leaseSeconds ?? 60;

  return {
    async syncTransactions(input: SyncTransactionsInput) {
      const lease = await options.syncStateRepository.acquireLease({
        endpoint: TRANSACTIONS_ENDPOINT,
        leaseOwner: input.leaseOwner,
        leaseSeconds,
        now: input.now,
        planId: input.planId
      });

      if (!lease.acquired) {
        return {
          status: "skipped" as const,
          reason: lease.reason
        };
      }

      const previousServerKnowledge = await options.syncStateRepository.getServerKnowledge(
        input.planId,
        TRANSACTIONS_ENDPOINT
      );

      try {
        const delta = await options.deltaClient.listTransactionsDelta(
          input.planId,
          previousServerKnowledge ?? undefined
        );

        if (delta.records.length > options.maxRowsPerRun) {
          const error = `Delta response contained ${delta.records.length} rows, exceeding the configured limit of ${options.maxRowsPerRun}.`;
          await options.syncStateRepository.recordFailure({
            endpoint: TRANSACTIONS_ENDPOINT,
            error,
            leaseOwner: input.leaseOwner,
            now: input.now,
            planId: input.planId
          });

          return {
            status: "failed" as const,
            reason: "row_limit_exceeded" as const
          };
        }

        const writeResult = await options.transactionsRepository.upsertTransactions({
          planId: input.planId,
          syncedAt: input.now,
          transactions: delta.records
        });

        const cursorResult = await options.syncStateRepository.advanceCursor({
          endpoint: TRANSACTIONS_ENDPOINT,
          leaseOwner: input.leaseOwner,
          now: input.now,
          planId: input.planId,
          previousServerKnowledge,
          rowsDeleted: writeResult.rowsDeleted,
          rowsUpserted: writeResult.rowsUpserted,
          serverKnowledge: delta.serverKnowledge
        });

        if (!cursorResult.advanced) {
          return {
            status: "failed" as const,
            reason: cursorResult.reason
          };
        }

        return {
          status: "ok" as const,
          rowsDeleted: writeResult.rowsDeleted,
          rowsUpserted: writeResult.rowsUpserted,
          serverKnowledge: delta.serverKnowledge
        };
      } catch (error) {
        const message = toErrorMessage(error);
        await options.syncStateRepository.recordFailure({
          endpoint: TRANSACTIONS_ENDPOINT,
          error: message,
          leaseOwner: input.leaseOwner,
          now: input.now,
          planId: input.planId
        });

        return {
          status: "failed" as const,
          reason: message
        };
      }
    }
  };
}
