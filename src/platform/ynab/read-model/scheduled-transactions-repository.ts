export type ScheduledSubtransactionRow = {
  id: string;
  scheduled_transaction_id?: string | null;
  amount_milliunits: number;
  memo?: string | null;
  payee_id?: string | null;
  payee_name?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  transfer_account_id?: string | null;
  deleted: number;
};

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
  // Present only under a category filter, where amount_milliunits is the
  // matched split-line share and this is the whole scheduled transaction.
  transaction_amount_milliunits?: number;
  subtransactions?: ScheduledSubtransactionRow[];
};

export type SearchScheduledTransactionsInput = {
  planId: string;
  fromDate?: string;
  toDate?: string;
  accountId?: string;
  categoryId?: string;
  payeeId?: string;
  limit?: number;
  offset?: number;
};

export type ScheduledTransactionSearchResult = {
  rows: ScheduledTransactionRow[];
  totalCount: number;
};

type CountRow = {
  count: number;
};

const rowsOrEmpty = <T>(result: { results?: T[] }) => result.results ?? [];

const SCHEDULED_SPLIT_LINES = `FROM ynab_scheduled_subtransactions line
                WHERE line.plan_id = ynab_scheduled_transactions.plan_id
                  AND line.scheduled_transaction_id = ynab_scheduled_transactions.id
                  AND line.deleted = 0`;

function selectScheduledTransactionSql(
  where: string,
  amountSql = "amount_milliunits",
) {
  return `SELECT id,
                 date_first,
                 date_next,
                 frequency,
                 ${amountSql},
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

function buildScheduledTransactionSearch(
  input: SearchScheduledTransactionsInput,
) {
  const where = ["plan_id = ?", "deleted = 0"];
  const params: Array<number | string> = [input.planId];

  if (input.fromDate) {
    where.push("COALESCE(date_next, date_first) >= ?");
    params.push(input.fromDate);
  }

  if (input.toDate) {
    where.push("COALESCE(date_next, date_first) <= ?");
    params.push(input.toDate);
  }

  if (input.accountId) {
    where.push("account_id = ?");
    params.push(input.accountId);
  }

  if (input.categoryId) {
    where.push(
      `(category_id = ? OR EXISTS (SELECT 1 ${SCHEDULED_SPLIT_LINES} AND line.category_id = ?))`,
    );
    params.push(input.categoryId, input.categoryId);
  }

  if (input.payeeId) {
    where.push("payee_id = ?");
    params.push(input.payeeId);
  }

  return {
    params,
    where: where.join(" AND "),
  };
}

function buildLimitSql(input: { limit?: number; offset?: number }) {
  if (input.limit === undefined) {
    return {
      params: [],
      sql: "",
    };
  }

  return {
    params: [input.limit, input.offset ?? 0],
    sql: "LIMIT ? OFFSET ?",
  };
}

async function listScheduledSubtransactionRows(
  database: D1Database,
  planId: string,
  scheduledTransactionId: string,
) {
  const result = await database
    .prepare(
      `SELECT id,
              scheduled_transaction_id,
              amount_milliunits,
              memo,
              payee_id,
              payee_name,
              category_id,
              category_name,
              transfer_account_id,
              deleted
       FROM ynab_scheduled_subtransactions
       WHERE plan_id = ? AND scheduled_transaction_id = ? AND deleted = 0
       ORDER BY id`,
    )
    .bind(planId, scheduledTransactionId)
    .all<ScheduledSubtransactionRow>();

  return rowsOrEmpty(result);
}

export function createScheduledTransactionsRepository(database: D1Database) {
  return {
    usesServerPagination: true,

    async listScheduledTransactions(
      input: SearchScheduledTransactionsInput,
    ): Promise<ScheduledTransactionSearchResult> {
      const search = buildScheduledTransactionSearch(input);
      const limit = buildLimitSql(input);
      // A split's full amount would overstate the filtered category, so rows
      // report the matching live split lines' share.
      const amountSql = input.categoryId
        ? `CASE
             WHEN EXISTS (SELECT 1 ${SCHEDULED_SPLIT_LINES})
             THEN (SELECT COALESCE(SUM(line.amount_milliunits), 0) ${SCHEDULED_SPLIT_LINES} AND line.category_id = ?)
             ELSE ynab_scheduled_transactions.amount_milliunits
           END AS amount_milliunits,
           ynab_scheduled_transactions.amount_milliunits AS transaction_amount_milliunits`
        : undefined;
      const resultPromise = database
        .prepare(
          `${selectScheduledTransactionSql(search.where, amountSql)}
           ORDER BY COALESCE(date_next, date_first), id
           ${limit.sql}`,
        )
        .bind(
          ...(input.categoryId ? [input.categoryId] : []),
          ...search.params,
          ...limit.params,
        )
        .all<ScheduledTransactionRow>();
      const countResultPromise = database
        .prepare(
          `SELECT COUNT(*) AS count FROM ynab_scheduled_transactions
           WHERE ${search.where}`,
        )
        .bind(...search.params)
        .all<CountRow>();
      const [result, countResult] = await Promise.all([
        resultPromise,
        countResultPromise,
      ]);

      return {
        rows: rowsOrEmpty(result),
        totalCount: rowsOrEmpty(countResult)[0]?.count ?? 0,
      };
    },

    async getScheduledTransaction(input: {
      planId: string;
      scheduledTransactionId: string;
    }) {
      const result = await database
        .prepare(
          `${selectScheduledTransactionSql("plan_id = ? AND id = ? AND deleted = 0")}
           LIMIT 1`,
        )
        .bind(input.planId, input.scheduledTransactionId)
        .all<ScheduledTransactionRow>();
      const row = rowsOrEmpty(result)[0] ?? null;

      if (!row) {
        return null;
      }

      const subtransactions = await listScheduledSubtransactionRows(
        database,
        input.planId,
        row.id,
      );

      return subtransactions.length ? { ...row, subtransactions } : row;
    },
  };
}
