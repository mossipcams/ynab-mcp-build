export type ScheduledTransactionRow = {
  id: string;
  date_first: string;
  date_next?: string | null;
  frequency?: string | null;
  amount_milliunits: number;
  memo?: string | null;
  flag_color?: string | null;
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

function selectScheduledTransactionSql(where: string) {
  return `SELECT id,
                 date_first,
                 date_next,
                 frequency,
                 amount_milliunits,
                 memo,
                 flag_color,
                 flag_name,
                 account_id,
                 account_name,
                 payee_id,
                 payee_name,
                 category_id,
                 category_name,
                 transfer_account_id,
                 deleted
          FROM ynab_scheduled_transactions
          WHERE ${where}`;
}

export function createScheduledTransactionsRepository(database: D1Database) {
  return {
    async listScheduledTransactions(input: { planId: string }) {
      const result = await database
        .prepare(
          `${selectScheduledTransactionSql("plan_id = ? AND deleted = 0")}
           ORDER BY date_next, id`,
        )
        .bind(input.planId)
        .all<ScheduledTransactionRow>();

      return result.results ?? [];
    },

    async getScheduledTransaction(input: {
      planId: string;
      scheduledTransactionId: string;
    }) {
      const result = await database
        .prepare(
          `${selectScheduledTransactionSql("plan_id = ? AND id = ?")}
           LIMIT 1`,
        )
        .bind(input.planId, input.scheduledTransactionId)
        .all<ScheduledTransactionRow>();

      return result.results?.[0] ?? null;
    },
  };
}
