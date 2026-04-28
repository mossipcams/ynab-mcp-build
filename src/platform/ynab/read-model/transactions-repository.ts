import type { YnabDeltaTransactionRecord } from "../delta-client.js";

export type UpsertTransactionsInput = {
  planId: string;
  transactions: YnabDeltaTransactionRecord[];
  syncedAt: string;
};

export type SearchTransactionsInput = {
  planId: string;
  startDate?: string;
  endDate?: string;
  accountIds?: string[];
  categoryIds?: string[];
  payeeIds?: string[];
  payeeSearch?: string;
  minAmountMilliunits?: number;
  maxAmountMilliunits?: number;
  includeDeleted?: boolean;
  limit: number;
};

export type TransactionSearchRow = {
  id: string;
  date: string;
  amount_milliunits: number;
  memo?: string | null;
  cleared?: string | null;
  approved?: number | null;
  flag_name?: string | null;
  account_id?: string | null;
  account_name?: string | null;
  payee_id?: string | null;
  payee_name?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  transfer_account_id?: string | null;
  deleted: number;
};

function toIntegerBoolean(value: boolean | null | undefined) {
  if (value === undefined || value === null) {
    return null;
  }

  return value ? 1 : 0;
}

function placeholders(count: number) {
  return Array.from({ length: count }, () => "?").join(", ");
}

export function createTransactionsRepository(database: D1Database) {
  return {
    async upsertTransactions(input: UpsertTransactionsInput) {
      const statements = input.transactions.map((transaction) =>
        database
          .prepare(
            `INSERT INTO ynab_transactions (
               plan_id,
               id,
               date,
               amount_milliunits,
               memo,
               cleared,
               approved,
               flag_name,
               account_id,
               account_name,
               payee_id,
               payee_name,
               category_id,
               category_name,
               transfer_account_id,
               deleted,
               synced_at,
               updated_at
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(plan_id, id) DO UPDATE SET
               date = excluded.date,
               amount_milliunits = excluded.amount_milliunits,
               memo = excluded.memo,
               cleared = excluded.cleared,
               approved = excluded.approved,
               flag_name = excluded.flag_name,
               account_id = excluded.account_id,
               account_name = excluded.account_name,
               payee_id = excluded.payee_id,
               payee_name = excluded.payee_name,
               category_id = excluded.category_id,
               category_name = excluded.category_name,
               transfer_account_id = excluded.transfer_account_id,
               deleted = excluded.deleted,
               synced_at = excluded.synced_at,
               updated_at = excluded.updated_at`
          )
          .bind(
            input.planId,
            transaction.id,
            transaction.date,
            transaction.amount,
            transaction.memo ?? null,
            transaction.cleared ?? null,
            toIntegerBoolean(transaction.approved),
            transaction.flag_name ?? null,
            transaction.account_id ?? null,
            transaction.account_name ?? null,
            transaction.payee_id ?? null,
            transaction.payee_name ?? null,
            transaction.category_id ?? null,
            transaction.category_name ?? null,
            transaction.transfer_account_id ?? null,
            transaction.deleted ? 1 : 0,
            input.syncedAt,
            input.syncedAt
          )
      );

      if (statements.length > 0) {
        await database.batch(statements);
      }

      return {
        rowsUpserted: input.transactions.length,
        rowsDeleted: input.transactions.filter((transaction) => transaction.deleted).length
      };
    },

    async searchTransactions(input: SearchTransactionsInput) {
      const where = ["plan_id = ?"];
      const params: Array<string | number> = [input.planId];

      if (input.startDate) {
        where.push("date >= ?");
        params.push(input.startDate);
      }

      if (input.endDate) {
        where.push("date <= ?");
        params.push(input.endDate);
      }

      if (!input.includeDeleted) {
        where.push("deleted = 0");
      }

      if (input.accountIds?.length) {
        where.push(`account_id IN (${placeholders(input.accountIds.length)})`);
        params.push(...input.accountIds);
      }

      if (input.categoryIds?.length) {
        where.push(`category_id IN (${placeholders(input.categoryIds.length)})`);
        params.push(...input.categoryIds);
      }

      if (input.payeeIds?.length) {
        where.push(`payee_id IN (${placeholders(input.payeeIds.length)})`);
        params.push(...input.payeeIds);
      }

      if (input.payeeSearch) {
        where.push("payee_name LIKE ?");
        params.push(`%${input.payeeSearch}%`);
      }

      if (input.minAmountMilliunits !== undefined) {
        where.push("amount_milliunits >= ?");
        params.push(input.minAmountMilliunits);
      }

      if (input.maxAmountMilliunits !== undefined) {
        where.push("amount_milliunits <= ?");
        params.push(input.maxAmountMilliunits);
      }

      params.push(input.limit);

      const result = await database
        .prepare(
          `SELECT id,
                  date,
                  amount_milliunits,
                  memo,
                  cleared,
                  approved,
                  flag_name,
                  account_id,
                  account_name,
                  payee_id,
                  payee_name,
                  category_id,
                  category_name,
                  transfer_account_id,
                  deleted
           FROM ynab_transactions
           WHERE ${where.join(" AND ")}
           ORDER BY date DESC, id
           LIMIT ?`
        )
        .bind(...params)
        .all<TransactionSearchRow>();

      return result.results ?? [];
    }
  };
}
