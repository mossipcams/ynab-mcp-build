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
  approved?: boolean;
  cleared?: string;
  minAmountMilliunits?: number;
  maxAmountMilliunits?: number;
  includeDeleted?: boolean;
  includeTransfers?: boolean;
  limit: number;
  offset?: number;
  sort?: "amount_asc" | "amount_desc" | "date_asc" | "date_desc";
};

export type TransactionSearchRow = {
  id: string;
  date: string;
  amount_milliunits: number;
  memo?: string | null;
  cleared?: string | null;
  approved?: number | null;
  flag_color?: string | null;
  flag_name?: string | null;
  account_id?: string | null;
  account_name?: string | null;
  payee_id?: string | null;
  payee_name?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  transfer_account_id?: string | null;
  transfer_transaction_id?: string | null;
  matched_transaction_id?: string | null;
  import_id?: string | null;
  import_payee_name?: string | null;
  import_payee_name_original?: string | null;
  debt_transaction_type?: string | null;
  deleted: number;
};

type TransactionCountRow = {
  count: number;
};

export type TransactionSearchResult = {
  rows: TransactionSearchRow[];
  totalCount: number;
};

export type TransactionSummaryInput = Omit<
  SearchTransactionsInput,
  "limit" | "offset" | "sort"
> & {
  topN?: number;
};

export type TransactionSummaryResult = {
  totals: {
    inflowMilliunits: number;
    outflowMilliunits: number;
  };
  topCategories: Array<{
    id?: string;
    name: string;
    amountMilliunits: number;
    transactionCount: number;
  }>;
  topPayees: Array<{
    id?: string;
    name: string;
    amountMilliunits: number;
    transactionCount: number;
  }>;
};

type TransactionTotalsRow = {
  inflow_milliunits: number | null;
  outflow_milliunits: number | null;
};

type TransactionRollupRow = {
  amount_milliunits: number | null;
  category_id?: string | null;
  payee_id?: string | null;
  name: string | null;
  transaction_count: number;
};

const D1_BATCH_SIZE = 50;

function toIntegerBoolean(value: boolean | null | undefined) {
  if (value === undefined || value === null) {
    return null;
  }

  return value ? 1 : 0;
}

function placeholders(count: number) {
  return Array.from({ length: count }, () => "?").join(", ");
}

function orderByClause(sort: SearchTransactionsInput["sort"]) {
  switch (sort ?? "date_desc") {
    case "date_asc":
      return "date ASC, id ASC";
    case "date_desc":
      return "date DESC, id ASC";
    case "amount_asc":
      return "amount_milliunits ASC, date DESC, id ASC";
    case "amount_desc":
      return "amount_milliunits DESC, date DESC, id ASC";
  }
}

function buildSearchWhere(
  input: Omit<SearchTransactionsInput, "limit" | "offset" | "sort">,
) {
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

  if (!input.includeTransfers) {
    where.push("transfer_account_id IS NULL");
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

  if (input.approved !== undefined) {
    where.push("approved = ?");
    params.push(input.approved ? 1 : 0);
  }

  if (input.cleared) {
    where.push("cleared = ?");
    params.push(input.cleared);
  }

  if (input.minAmountMilliunits !== undefined) {
    where.push("amount_milliunits >= ?");
    params.push(input.minAmountMilliunits);
  }

  if (input.maxAmountMilliunits !== undefined) {
    where.push("amount_milliunits <= ?");
    params.push(input.maxAmountMilliunits);
  }

  return {
    params,
    whereClause: where.join(" AND "),
  };
}

async function runBatch(
  database: D1Database,
  statements: D1PreparedStatement[],
): Promise<void> {
  for (let index = 0; index < statements.length; index += D1_BATCH_SIZE) {
    await database.batch(statements.slice(index, index + D1_BATCH_SIZE));
  }
}

export function createTransactionsRepository(database: D1Database) {
  return {
    async upsertTransactions(input: UpsertTransactionsInput) {
      const statements = input.transactions.flatMap((transaction) => {
        const transactionStatement = database
          .prepare(
            `INSERT INTO ynab_transactions (
               plan_id,
               id,
               date,
               amount_milliunits,
               memo,
               cleared,
               approved,
               flag_color,
               flag_name,
               account_id,
               account_name,
               payee_id,
               payee_name,
               category_id,
               category_name,
               transfer_account_id,
               transfer_transaction_id,
               matched_transaction_id,
               import_id,
               import_payee_name,
               import_payee_name_original,
               debt_transaction_type,
               deleted,
               synced_at,
               updated_at
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(plan_id, id) DO UPDATE SET
               date = excluded.date,
               amount_milliunits = excluded.amount_milliunits,
               memo = excluded.memo,
               cleared = excluded.cleared,
               approved = excluded.approved,
               flag_color = excluded.flag_color,
               flag_name = excluded.flag_name,
               account_id = excluded.account_id,
               account_name = excluded.account_name,
               payee_id = excluded.payee_id,
               payee_name = excluded.payee_name,
               category_id = excluded.category_id,
               category_name = excluded.category_name,
               transfer_account_id = excluded.transfer_account_id,
               transfer_transaction_id = excluded.transfer_transaction_id,
               matched_transaction_id = excluded.matched_transaction_id,
               import_id = excluded.import_id,
               import_payee_name = excluded.import_payee_name,
               import_payee_name_original = excluded.import_payee_name_original,
               debt_transaction_type = excluded.debt_transaction_type,
               deleted = excluded.deleted,
               synced_at = excluded.synced_at,
               updated_at = excluded.updated_at`,
          )
          .bind(
            input.planId,
            transaction.id,
            transaction.date,
            transaction.amount,
            transaction.memo ?? null,
            transaction.cleared ?? null,
            toIntegerBoolean(transaction.approved),
            transaction.flag_color ?? null,
            transaction.flag_name ?? null,
            transaction.account_id ?? null,
            transaction.account_name ?? null,
            transaction.payee_id ?? null,
            transaction.payee_name ?? null,
            transaction.category_id ?? null,
            transaction.category_name ?? null,
            transaction.transfer_account_id ?? null,
            transaction.transfer_transaction_id ?? null,
            transaction.matched_transaction_id ?? null,
            transaction.import_id ?? null,
            transaction.import_payee_name ?? null,
            transaction.import_payee_name_original ?? null,
            transaction.debt_transaction_type ?? null,
            transaction.deleted ? 1 : 0,
            input.syncedAt,
            input.syncedAt,
          );

        const subtransactionStatements = (
          transaction.subtransactions ?? []
        ).map((subtransaction) =>
          database
            .prepare(
              `INSERT INTO ynab_subtransactions (
                 plan_id,
                 transaction_id,
                 id,
                 amount_milliunits,
                 memo,
                 payee_id,
                 payee_name,
                 category_id,
                 category_name,
                 transfer_account_id,
                 transfer_transaction_id,
                 deleted,
                 synced_at,
                 updated_at
               )
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(plan_id, transaction_id, id) DO UPDATE SET
                 amount_milliunits = excluded.amount_milliunits,
                 memo = excluded.memo,
                 payee_id = excluded.payee_id,
                 payee_name = excluded.payee_name,
                 category_id = excluded.category_id,
                 category_name = excluded.category_name,
                 transfer_account_id = excluded.transfer_account_id,
                 transfer_transaction_id = excluded.transfer_transaction_id,
                 deleted = excluded.deleted,
                 synced_at = excluded.synced_at,
                 updated_at = excluded.updated_at`,
            )
            .bind(
              input.planId,
              subtransaction.transaction_id ?? transaction.id,
              subtransaction.id,
              subtransaction.amount,
              subtransaction.memo ?? null,
              subtransaction.payee_id ?? null,
              subtransaction.payee_name ?? null,
              subtransaction.category_id ?? null,
              subtransaction.category_name ?? null,
              subtransaction.transfer_account_id ?? null,
              subtransaction.transfer_transaction_id ?? null,
              subtransaction.deleted ? 1 : 0,
              input.syncedAt,
              input.syncedAt,
            ),
        );

        return [transactionStatement, ...subtransactionStatements];
      });

      await runBatch(database, statements);

      return {
        rowsUpserted: input.transactions.length,
        rowsDeleted: input.transactions.filter(
          (transaction) => transaction.deleted,
        ).length,
      };
    },

    async searchTransactions(
      input: SearchTransactionsInput,
    ): Promise<TransactionSearchResult> {
      const search = buildSearchWhere(input);
      const countResult = await database
        .prepare(
          `SELECT COUNT(*) AS count
           FROM ynab_transactions
           WHERE ${search.whereClause}`,
        )
        .bind(...search.params)
        .all<TransactionCountRow>();
      const rowParams = [...search.params, input.limit, input.offset ?? 0];

      const result = await database
        .prepare(
          `SELECT id,
                  date,
                  amount_milliunits,
                  memo,
                  cleared,
                  approved,
                  flag_color,
                  flag_name,
                  account_id,
                  account_name,
                  payee_id,
                  payee_name,
                  category_id,
                  category_name,
                  transfer_account_id,
                  transfer_transaction_id,
                  matched_transaction_id,
                  import_id,
                  import_payee_name,
                  import_payee_name_original,
                  debt_transaction_type,
                  deleted
           FROM ynab_transactions
           WHERE ${search.whereClause}
           ORDER BY ${orderByClause(input.sort)}
           LIMIT ? OFFSET ?`,
        )
        .bind(...rowParams)
        .all<TransactionSearchRow>();

      return {
        rows: result.results ?? [],
        totalCount: countResult.results?.[0]?.count ?? 0,
      };
    },

    async summarizeTransactions(
      input: TransactionSummaryInput,
    ): Promise<TransactionSummaryResult> {
      const search = buildSearchWhere(input);
      const topN = Math.max(input.topN ?? 5, 1);
      const totalsResult = await database
        .prepare(
          `SELECT COALESCE(SUM(CASE WHEN amount_milliunits >= 0 THEN amount_milliunits ELSE 0 END), 0) AS inflow_milliunits,
                  COALESCE(SUM(CASE WHEN amount_milliunits < 0 THEN -amount_milliunits ELSE 0 END), 0) AS outflow_milliunits
           FROM ynab_transactions
           WHERE ${search.whereClause}`,
        )
        .bind(...search.params)
        .all<TransactionTotalsRow>();
      const categoryResult = await database
        .prepare(
          `SELECT category_id,
                  COALESCE(category_name, 'Uncategorized') AS name,
                  COALESCE(SUM(-amount_milliunits), 0) AS amount_milliunits,
                  COUNT(*) AS transaction_count
           FROM ynab_transactions
           WHERE ${search.whereClause} AND amount_milliunits < 0
           GROUP BY category_id, COALESCE(category_name, 'Uncategorized')
           ORDER BY amount_milliunits DESC, name ASC
           LIMIT ?`,
        )
        .bind(...search.params, topN)
        .all<TransactionRollupRow>();
      const payeeResult = await database
        .prepare(
          `SELECT payee_id,
                  COALESCE(payee_name, 'Unknown Payee') AS name,
                  COALESCE(SUM(-amount_milliunits), 0) AS amount_milliunits,
                  COUNT(*) AS transaction_count
           FROM ynab_transactions
           WHERE ${search.whereClause} AND amount_milliunits < 0
           GROUP BY payee_id, COALESCE(payee_name, 'Unknown Payee')
           ORDER BY amount_milliunits DESC, name ASC
           LIMIT ?`,
        )
        .bind(...search.params, topN)
        .all<TransactionRollupRow>();
      const totals = totalsResult.results?.[0];

      return {
        totals: {
          inflowMilliunits: totals?.inflow_milliunits ?? 0,
          outflowMilliunits: totals?.outflow_milliunits ?? 0,
        },
        topCategories: (categoryResult.results ?? []).map((row) => ({
          ...(row.category_id ? { id: row.category_id } : {}),
          amountMilliunits: row.amount_milliunits ?? 0,
          name: row.name ?? "Uncategorized",
          transactionCount: row.transaction_count,
        })),
        topPayees: (payeeResult.results ?? []).map((row) => ({
          ...(row.payee_id ? { id: row.payee_id } : {}),
          amountMilliunits: row.amount_milliunits ?? 0,
          name: row.name ?? "Unknown Payee",
          transactionCount: row.transaction_count,
        })),
      };
    },
  };
}
