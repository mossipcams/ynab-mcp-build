import type { YnabDeltaTransactionRecord } from "../delta-client.js";
import { runD1Batches } from "./d1-batch.js";

const rowsOrEmpty = <T>(result: { results?: T[] }) => result.results ?? [];

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
  minAbsAmountMilliunits?: number;
  maxAbsAmountMilliunits?: number;
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

const toMilliunits = (value: number | null) => value ?? 0;

function toIntegerBoolean(value: boolean | null | undefined) {
  if (value === undefined || value === null) {
    return null;
  }

  return value ? 1 : 0;
}

function placeholders(count: number) {
  return Array.from({ length: count }, () => "?").join(", ");
}

function escapeLikePattern(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
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
  const where = ["ynab_transactions.plan_id = ?"];
  const params: Array<string | number> = [input.planId];

  if (input.startDate) {
    where.push("ynab_transactions.date >= ?");
    params.push(input.startDate);
  }

  if (input.endDate) {
    where.push("ynab_transactions.date <= ?");
    params.push(input.endDate);
  }

  if (!input.includeDeleted) {
    where.push("ynab_transactions.deleted = 0");
  }

  if (!input.includeTransfers) {
    where.push("ynab_transactions.transfer_account_id IS NULL");
  }

  if (input.accountIds?.length) {
    where.push(
      `ynab_transactions.account_id IN (${placeholders(input.accountIds.length)})`,
    );
    params.push(...input.accountIds);
  }

  if (input.categoryIds?.length) {
    const categoryPlaceholders = placeholders(input.categoryIds.length);
    where.push(
      `(ynab_transactions.category_id IN (${categoryPlaceholders})
       OR EXISTS (
        SELECT 1
        FROM ynab_subtransactions subtransaction_filter
        WHERE subtransaction_filter.plan_id = ynab_transactions.plan_id
          AND subtransaction_filter.transaction_id = ynab_transactions.id
          AND subtransaction_filter.deleted = 0
          AND subtransaction_filter.category_id IN (${categoryPlaceholders})
        LIMIT 1
       )
       OR (
        ynab_transactions.category_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM ynab_subtransactions subtransaction_filter
          WHERE subtransaction_filter.plan_id = ynab_transactions.plan_id
            AND subtransaction_filter.transaction_id = ynab_transactions.id
            AND subtransaction_filter.deleted = 0
          LIMIT 1
        )
        AND EXISTS (
        SELECT 1
        FROM ynab_categories cat
        WHERE cat.plan_id = ynab_transactions.plan_id
          AND cat.id IN (${categoryPlaceholders})
          AND cat.name = 'Uncategorized'
          AND cat.deleted = 0
        LIMIT 1
        )
       )
       OR EXISTS (
        SELECT 1
        FROM ynab_subtransactions subtransaction_filter
        WHERE subtransaction_filter.plan_id = ynab_transactions.plan_id
          AND subtransaction_filter.transaction_id = ynab_transactions.id
          AND subtransaction_filter.deleted = 0
          AND subtransaction_filter.category_id IS NULL
          AND EXISTS (
            SELECT 1
            FROM ynab_categories cat
            WHERE cat.plan_id = ynab_transactions.plan_id
              AND cat.id IN (${categoryPlaceholders})
              AND cat.name = 'Uncategorized'
              AND cat.deleted = 0
            LIMIT 1
          )
        LIMIT 1
       ))`,
    );
    params.push(...input.categoryIds);
    params.push(...input.categoryIds);
    params.push(...input.categoryIds);
    params.push(...input.categoryIds);
  }

  if (input.payeeIds?.length) {
    where.push(
      `ynab_transactions.payee_id IN (${placeholders(input.payeeIds.length)})`,
    );
    params.push(...input.payeeIds);
  }

  if (input.payeeSearch) {
    where.push("ynab_transactions.payee_name LIKE ? ESCAPE '\\'");
    params.push(`%${escapeLikePattern(input.payeeSearch)}%`);
  }

  if (input.approved !== undefined) {
    where.push("ynab_transactions.approved = ?");
    params.push(input.approved ? 1 : 0);
  }

  if (input.cleared) {
    where.push("ynab_transactions.cleared = ?");
    params.push(input.cleared);
  }

  if (input.minAmountMilliunits !== undefined) {
    where.push("ynab_transactions.amount_milliunits >= ?");
    params.push(input.minAmountMilliunits);
  }

  if (input.maxAmountMilliunits !== undefined) {
    where.push("ynab_transactions.amount_milliunits <= ?");
    params.push(input.maxAmountMilliunits);
  }

  if (input.minAbsAmountMilliunits !== undefined) {
    where.push("ABS(ynab_transactions.amount_milliunits) >= ?");
    params.push(input.minAbsAmountMilliunits);
  }

  if (input.maxAbsAmountMilliunits !== undefined) {
    where.push("ABS(ynab_transactions.amount_milliunits) <= ?");
    params.push(input.maxAbsAmountMilliunits);
  }

  return {
    params,
    whereClause: where.join(" AND "),
  };
}

function buildCategoryLineWhere(
  input: Pick<TransactionSummaryInput, "categoryIds">,
): { params: Array<string | number>; whereClause: string } {
  if (!input.categoryIds?.length) {
    return {
      params: [],
      whereClause: "",
    };
  }

  const categoryPlaceholders = placeholders(input.categoryIds.length);

  return {
    params: [...input.categoryIds, ...input.categoryIds],
    whereClause: ` AND (
      transaction_lines.category_id IN (${categoryPlaceholders})
      OR (
        transaction_lines.category_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM ynab_categories cat
          WHERE cat.plan_id = transaction_lines.plan_id
            AND cat.id IN (${categoryPlaceholders})
            AND cat.name = 'Uncategorized'
            AND cat.deleted = 0
          LIMIT 1
        )
      )
    )`,
  };
}

function buildTransactionLinesCte(searchWhereClause: string) {
  return `WITH matching_transactions AS (
             SELECT plan_id,
                    id,
                    payee_id,
                    payee_name,
                    category_id,
                    category_name,
                    amount_milliunits
             FROM ynab_transactions
             WHERE ${searchWhereClause}
           ),
           transaction_lines AS (
             SELECT matching_transactions.plan_id,
                    matching_transactions.id AS transaction_id,
                    COALESCE(subtransaction.payee_id, matching_transactions.payee_id) AS payee_id,
                    COALESCE(subtransaction.payee_name, matching_transactions.payee_name) AS payee_name,
                    subtransaction.category_id,
                    subtransaction.category_name,
                    subtransaction.amount_milliunits
             FROM matching_transactions
             JOIN ynab_subtransactions subtransaction
               ON subtransaction.plan_id = matching_transactions.plan_id
              AND subtransaction.transaction_id = matching_transactions.id
              AND subtransaction.deleted = 0
             UNION ALL
             SELECT matching_transactions.plan_id,
                    matching_transactions.id AS transaction_id,
                    matching_transactions.payee_id,
                    matching_transactions.payee_name,
                    matching_transactions.category_id,
                    matching_transactions.category_name,
                    matching_transactions.amount_milliunits
             FROM matching_transactions
             WHERE NOT EXISTS (
               SELECT 1
               FROM ynab_subtransactions subtransaction
               WHERE subtransaction.plan_id = matching_transactions.plan_id
                 AND subtransaction.transaction_id = matching_transactions.id
                 AND subtransaction.deleted = 0
               LIMIT 1
             )
           )`;
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
               updated_at = excluded.updated_at
               WHERE updated_at <= excluded.updated_at`,
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

        const hasSubtransactionSnapshot = Array.isArray(
          transaction.subtransactions,
        );
        const subtransactions = transaction.subtransactions ?? [];
        const omittedSubtransactionCleanupStatement = hasSubtransactionSnapshot
          ? database
              .prepare(
                `UPDATE ynab_subtransactions
                 SET deleted = 1,
                     synced_at = ?,
                     updated_at = ?
                 WHERE plan_id = ?
                   AND transaction_id = ?
                   AND deleted = 0
                   ${
                     subtransactions.length
                       ? `AND id NOT IN (${placeholders(subtransactions.length)})`
                       : ""
                   }
                   AND updated_at <= ?`,
              )
              .bind(
                input.syncedAt,
                input.syncedAt,
                input.planId,
                transaction.id,
                ...subtransactions.map((subtransaction) => subtransaction.id),
                input.syncedAt,
              )
          : undefined;
        const subtransactionStatements = subtransactions.map((subtransaction) =>
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
                 updated_at = excluded.updated_at
               WHERE updated_at <= excluded.updated_at`,
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

        return [
          transactionStatement,
          ...(omittedSubtransactionCleanupStatement
            ? [omittedSubtransactionCleanupStatement]
            : []),
          ...subtransactionStatements,
        ];
      });

      await runD1Batches(database, statements);

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
      const countResultPromise = database
        .prepare(
          `SELECT COUNT(*) AS count
           FROM ynab_transactions
           WHERE ${search.whereClause}`,
        )
        .bind(...search.params)
        .all<TransactionCountRow>();
      const rowParams = [...search.params, input.limit, input.offset ?? 0];

      const resultPromise = database
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
      const [countResult, result] = await Promise.all([
        countResultPromise,
        resultPromise,
      ]);

      return {
        rows: rowsOrEmpty(result),
        totalCount: rowsOrEmpty(countResult)[0]?.count ?? 0,
      };
    },

    async summarizeTransactions(
      input: TransactionSummaryInput,
    ): Promise<TransactionSummaryResult> {
      const search = buildSearchWhere(input);
      const categoryLineWhere = buildCategoryLineWhere(input);
      const transactionLinesCte = buildTransactionLinesCte(search.whereClause);
      const isLineScopedSummary = categoryLineWhere.whereClause !== "";
      const topN = Math.max(input.topN ?? 5, 1);
      const totalsResultPromise = database
        .prepare(
          isLineScopedSummary
            ? `${transactionLinesCte}
           SELECT COALESCE(SUM(CASE WHEN amount_milliunits >= 0 THEN amount_milliunits ELSE 0 END), 0) AS inflow_milliunits,
                  COALESCE(SUM(CASE WHEN amount_milliunits < 0 THEN -amount_milliunits ELSE 0 END), 0) AS outflow_milliunits
           FROM transaction_lines
           WHERE 1 = 1${categoryLineWhere.whereClause}`
            : `SELECT COALESCE(SUM(CASE WHEN amount_milliunits >= 0 THEN amount_milliunits ELSE 0 END), 0) AS inflow_milliunits,
                  COALESCE(SUM(CASE WHEN amount_milliunits < 0 THEN -amount_milliunits ELSE 0 END), 0) AS outflow_milliunits
           FROM ynab_transactions
           WHERE ${search.whereClause}`,
        )
        .bind(
          ...search.params,
          ...(isLineScopedSummary ? categoryLineWhere.params : []),
        )
        .all<TransactionTotalsRow>();
      const categoryResultPromise = database
        .prepare(
          `${transactionLinesCte}
           SELECT rollup.category_id,
                  COALESCE(category.name, rollup.name, 'Uncategorized') AS name,
                  rollup.amount_milliunits,
                  rollup.transaction_count
           FROM (
             SELECT MAX(plan_id) AS plan_id,
                    MAX(category_id) AS category_id,
                    MIN(category_name) AS name,
                    COALESCE(SUM(-amount_milliunits), 0) AS amount_milliunits,
                    COUNT(DISTINCT transaction_id) AS transaction_count
             FROM (
               SELECT CASE
                        WHEN category_id IS NOT NULL THEN 'id:' || category_id
                        WHEN category_name IS NOT NULL THEN 'name:' || category_name
                        ELSE 'none:uncategorized'
                      END AS category_key,
                      plan_id,
                      category_id,
                      category_name,
                      amount_milliunits,
                      transaction_id
               FROM transaction_lines
               WHERE amount_milliunits < 0${categoryLineWhere.whereClause}
             )
             GROUP BY category_key
           ) rollup
           LEFT JOIN ynab_categories category
             ON category.plan_id = rollup.plan_id
            AND category.id = rollup.category_id
            AND category.deleted = 0
           ORDER BY rollup.amount_milliunits DESC, name ASC
           LIMIT ?`,
        )
        .bind(...search.params, ...categoryLineWhere.params, topN)
        .all<TransactionRollupRow>();
      const payeeResultPromise = database
        .prepare(
          isLineScopedSummary
            ? `${transactionLinesCte}
           SELECT rollup.payee_id,
                  COALESCE(payee.name, rollup.name, 'Unknown Payee') AS name,
                  rollup.amount_milliunits,
                  rollup.transaction_count
           FROM (
             SELECT MAX(plan_id) AS plan_id,
                    MAX(payee_id) AS payee_id,
                    MIN(payee_name) AS name,
                    COALESCE(SUM(-amount_milliunits), 0) AS amount_milliunits,
                    COUNT(DISTINCT transaction_id) AS transaction_count
             FROM (
               SELECT CASE
                        WHEN payee_id IS NOT NULL THEN 'id:' || payee_id
                        WHEN payee_name IS NOT NULL THEN 'name:' || payee_name
                        ELSE 'none:unknown'
                      END AS payee_key,
                      plan_id,
                      payee_id,
                      payee_name,
                      amount_milliunits,
                      transaction_id
               FROM transaction_lines
               WHERE amount_milliunits < 0${categoryLineWhere.whereClause}
             )
             GROUP BY payee_key
           ) rollup
           LEFT JOIN ynab_payees payee
             ON payee.plan_id = rollup.plan_id
            AND payee.id = rollup.payee_id
            AND payee.deleted = 0
           ORDER BY rollup.amount_milliunits DESC, name ASC
           LIMIT ?`
            : `SELECT rollup.payee_id,
                  COALESCE(payee.name, rollup.name, 'Unknown Payee') AS name,
                  rollup.amount_milliunits,
                  rollup.transaction_count
           FROM (
             SELECT MAX(plan_id) AS plan_id,
                    MAX(payee_id) AS payee_id,
                    MIN(payee_name) AS name,
                    COALESCE(SUM(-amount_milliunits), 0) AS amount_milliunits,
                    COUNT(*) AS transaction_count
             FROM (
               SELECT CASE
                        WHEN payee_id IS NOT NULL THEN 'id:' || payee_id
                        WHEN payee_name IS NOT NULL THEN 'name:' || payee_name
                        ELSE 'none:unknown'
                      END AS payee_key,
                      plan_id,
                      payee_id,
                      payee_name,
                      amount_milliunits
               FROM ynab_transactions
               WHERE ${search.whereClause} AND amount_milliunits < 0
             )
             GROUP BY payee_key
           ) rollup
           LEFT JOIN ynab_payees payee
             ON payee.plan_id = rollup.plan_id
            AND payee.id = rollup.payee_id
            AND payee.deleted = 0
           ORDER BY rollup.amount_milliunits DESC, name ASC
           LIMIT ?`,
        )
        .bind(
          ...search.params,
          ...(isLineScopedSummary ? categoryLineWhere.params : []),
          topN,
        )
        .all<TransactionRollupRow>();
      const [totalsResult, categoryResult, payeeResult] = await Promise.all([
        totalsResultPromise,
        categoryResultPromise,
        payeeResultPromise,
      ]);
      const totals = rowsOrEmpty(totalsResult)[0];

      return {
        totals: {
          inflowMilliunits: totals?.inflow_milliunits ?? 0,
          outflowMilliunits: totals?.outflow_milliunits ?? 0,
        },
        topCategories: rowsOrEmpty(categoryResult).map((row) => ({
          ...(row.category_id ? { id: row.category_id } : {}),
          amountMilliunits: toMilliunits(row.amount_milliunits),
          name: row.name ?? "Uncategorized",
          transactionCount: row.transaction_count,
        })),
        topPayees: rowsOrEmpty(payeeResult).map((row) => ({
          ...(row.payee_id ? { id: row.payee_id } : {}),
          amountMilliunits: toMilliunits(row.amount_milliunits),
          name: row.name ?? "Unknown Payee",
          transactionCount: row.transaction_count,
        })),
      };
    },
  };
}
