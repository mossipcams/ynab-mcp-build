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
    where.push("category_id = ?");
    params.push(input.categoryId);
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

export function createScheduledTransactionsRepository(database: D1Database) {
  return {
    usesServerPagination: true,

    async listScheduledTransactions(
      input: SearchScheduledTransactionsInput,
    ): Promise<ScheduledTransactionSearchResult> {
      const search = buildScheduledTransactionSearch(input);
      const limit = buildLimitSql(input);
      const resultPromise = database
        .prepare(
          `${selectScheduledTransactionSql(search.where)}
           ORDER BY COALESCE(date_next, date_first), id
           ${limit.sql}`,
        )
        .bind(...search.params, ...limit.params)
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

      return rowsOrEmpty(result)[0] ?? null;
    },
  };
}
