import type { TransactionSearchRow } from "../../platform/ynab/read-model/transactions-repository.js";
import {
  formatAmountMilliunits,
  hasPaginationControls,
  hasProjectionControls,
  paginateEntries,
  projectRecord,
  shouldPaginateEntries
} from "../../shared/collections.js";
import { compactObject } from "../../shared/object.js";

const REQUIRED_ENDPOINTS = ["transactions"] as const;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const transactionFields = [
  "date",
  "amount",
  "payee_name",
  "category_name",
  "account_name",
  "approved",
  "cleared"
] as const;

type TransactionField = (typeof transactionFields)[number];
type TransactionSort = "amount_asc" | "amount_desc" | "date_asc" | "date_desc";

export type DbTransactionSearchInput = {
  planId?: string;
  fromDate?: string;
  toDate?: string;
  payeeId?: string;
  accountId?: string;
  categoryId?: string;
  approved?: boolean;
  cleared?: string;
  minAmount?: number;
  maxAmount?: number;
  includeTransfers?: boolean;
  includeSummary?: boolean;
  includeDeleted?: boolean;
  offset?: number;
  fields?: TransactionField[];
  includeIds?: boolean;
  limit?: number;
  sort?: TransactionSort;
};

type FreshnessResult = {
  last_synced_at: string | null;
  stale: boolean;
  health_status: string;
  warning: string | null;
};

type DbTransactionServiceDependencies = {
  defaultPlanId?: string;
  transactionsRepository: {
    searchTransactions(input: {
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
      sort?: TransactionSort;
    }): Promise<TransactionSearchRow[]>;
  };
  freshness: {
    getFreshness(planId: string, requiredEndpoints: readonly string[]): Promise<FreshnessResult>;
  };
};

function resolvePlanId(input: { planId?: string }, defaultPlanId?: string) {
  const inputPlanId = input.planId?.trim();

  if (inputPlanId) {
    return inputPlanId;
  }

  const planId = defaultPlanId?.trim();

  if (!planId) {
    throw new Error("planId is required when YNAB_DEFAULT_PLAN_ID is not configured.");
  }

  return planId;
}

function resolveLimit(limit: number | undefined) {
  return Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
}

function resolveFetchLimit(input: DbTransactionSearchInput) {
  return Math.min((input.offset ?? 0) + resolveLimit(input.limit), MAX_LIMIT);
}

function toFreshnessEnvelope(freshness: FreshnessResult) {
  return {
    ...freshness,
    required_endpoints: [...REQUIRED_ENDPOINTS]
  };
}

function isUnhealthy(freshness: FreshnessResult) {
  return freshness.health_status === "never_synced" || freshness.health_status === "unhealthy";
}

function toDisplayTransaction(row: TransactionSearchRow) {
  return Object.fromEntries(Object.entries({
    id: row.id,
    date: row.date,
    amount: formatAmountMilliunits(row.amount_milliunits),
    amount_milliunits: row.amount_milliunits,
    memo: row.memo,
    cleared: row.cleared,
    approved: row.approved === undefined || row.approved === null ? undefined : Boolean(row.approved),
    flag_color: row.flag_color,
    flag_name: row.flag_name,
    account_id: row.account_id,
    account_name: row.account_name,
    payee_id: row.payee_id,
    payee_name: row.payee_name,
    category_id: row.category_id,
    category_name: row.category_name,
    transfer_account_id: row.transfer_account_id,
    transfer_transaction_id: row.transfer_transaction_id,
    matched_transaction_id: row.matched_transaction_id,
    import_id: row.import_id,
    import_payee_name: row.import_payee_name,
    import_payee_name_original: row.import_payee_name_original,
    debt_transaction_type: row.debt_transaction_type,
    deleted: row.deleted ? true : undefined
  }).filter(([, value]) => value !== undefined));
}

function rowApproved(row: TransactionSearchRow) {
  return row.approved === undefined || row.approved === null ? undefined : Boolean(row.approved);
}

function isTransfer(row: TransactionSearchRow) {
  return Boolean(row.transfer_account_id);
}

function compareRows(left: TransactionSearchRow, right: TransactionSearchRow, sort: TransactionSort) {
  switch (sort) {
    case "date_asc":
      return left.date.localeCompare(right.date) || left.id.localeCompare(right.id);
    case "date_desc":
      return right.date.localeCompare(left.date) || left.id.localeCompare(right.id);
    case "amount_asc":
      return left.amount_milliunits - right.amount_milliunits || right.date.localeCompare(left.date) || left.id.localeCompare(right.id);
    case "amount_desc":
      return right.amount_milliunits - left.amount_milliunits || right.date.localeCompare(left.date) || left.id.localeCompare(right.id);
  }
}

function matchesTransactionFilters(row: TransactionSearchRow, input: DbTransactionSearchInput) {
  return [
    input.includeDeleted === true || !row.deleted,
    input.includeTransfers === true || !isTransfer(row),
    !input.toDate || row.date <= input.toDate,
    !input.payeeId || row.payee_id === input.payeeId,
    !input.accountId || row.account_id === input.accountId,
    !input.categoryId || row.category_id === input.categoryId,
    input.approved === undefined || rowApproved(row) === input.approved,
    !input.cleared || row.cleared === input.cleared,
    input.minAmount === undefined || row.amount_milliunits >= input.minAmount,
    input.maxAmount === undefined || row.amount_milliunits <= input.maxAmount
  ].every(Boolean);
}

function buildTransactionSummary(rows: TransactionSearchRow[], topN = 5) {
  const categoryRollups = new Map<string, { id?: string; name: string; amountMilliunits: number; transactionCount: number }>();
  const payeeRollups = new Map<string, { id?: string; name: string; amountMilliunits: number; transactionCount: number }>();
  let inflowMilliunits = 0;
  let outflowMilliunits = 0;

  for (const row of rows) {
    if (row.amount_milliunits >= 0) {
      inflowMilliunits += row.amount_milliunits;
    } else {
      const amountMilliunits = Math.abs(row.amount_milliunits);
      outflowMilliunits += amountMilliunits;

      const categoryKey = row.category_id ?? row.category_name ?? "uncategorized";
      const existingCategory = categoryRollups.get(categoryKey);
      if (existingCategory) {
        existingCategory.amountMilliunits += amountMilliunits;
        existingCategory.transactionCount += 1;
      } else {
        categoryRollups.set(categoryKey, {
          ...(row.category_id ? { id: row.category_id } : {}),
          name: row.category_name ?? "Uncategorized",
          amountMilliunits,
          transactionCount: 1
        });
      }

      const payeeKey = row.payee_id ?? row.payee_name ?? "unknown";
      const existingPayee = payeeRollups.get(payeeKey);
      if (existingPayee) {
        existingPayee.amountMilliunits += amountMilliunits;
        existingPayee.transactionCount += 1;
      } else {
        payeeRollups.set(payeeKey, {
          ...(row.payee_id ? { id: row.payee_id } : {}),
          name: row.payee_name ?? "Unknown Payee",
          amountMilliunits,
          transactionCount: 1
        });
      }
    }
  }

  const toTopRollups = (
    entries: Array<{ id?: string; name: string; amountMilliunits: number; transactionCount: number }>
  ) =>
    entries
      .sort((left, right) => right.amountMilliunits - left.amountMilliunits || left.name.localeCompare(right.name))
      .slice(0, topN)
      .map((entry) =>
        compactObject({
          id: entry.id,
          name: entry.name,
          amount: formatAmountMilliunits(entry.amountMilliunits),
          transaction_count: entry.transactionCount
        })
      );

  return {
    totals: {
      total_inflow: formatAmountMilliunits(inflowMilliunits),
      total_outflow: formatAmountMilliunits(outflowMilliunits),
      net: formatAmountMilliunits(inflowMilliunits - outflowMilliunits)
    },
    top_categories: toTopRollups(Array.from(categoryRollups.values())),
    top_payees: toTopRollups(Array.from(payeeRollups.values()))
  };
}

function buildTransactionCollectionResult(
  rows: TransactionSearchRow[],
  input: DbTransactionSearchInput,
  extra: Record<string, unknown> = {}
) {
  const displayTransactions = rows.map(toDisplayTransaction);
  const shouldPaginate = shouldPaginateEntries(displayTransactions, input);

  if (!shouldPaginate && !hasProjectionControls(input)) {
    return {
      transactions: displayTransactions,
      match_count: rows.length,
      ...extra
    };
  }

  if (!shouldPaginate) {
    return {
      transactions: displayTransactions.map((transaction) => projectRecord(transaction, transactionFields, input)),
      match_count: rows.length,
      ...extra
    };
  }

  const pagedTransactions = paginateEntries(displayTransactions, input);

  return {
    transactions: hasProjectionControls(input)
      ? pagedTransactions.entries.map((transaction) => projectRecord(transaction, transactionFields, input))
      : pagedTransactions.entries,
    match_count: rows.length,
    ...pagedTransactions.metadata,
    ...extra
  };
}

export async function searchTransactions(
  dependencies: DbTransactionServiceDependencies,
  input: DbTransactionSearchInput
) {
  const planId = resolvePlanId(input, dependencies.defaultPlanId);
  const freshness = await dependencies.freshness.getFreshness(planId, REQUIRED_ENDPOINTS);
  const dataFreshness = toFreshnessEnvelope(freshness);

  if (isUnhealthy(freshness)) {
    return {
      status: "unhealthy",
      data_freshness: dataFreshness,
      data: null
    };
  }

  const transactions = await dependencies.transactionsRepository.searchTransactions({
    includeDeleted: input.includeDeleted ?? false,
    includeTransfers: input.includeTransfers ?? false,
    limit: resolveFetchLimit(input),
    planId,
    ...(input.accountId ? { accountIds: [input.accountId] } : {}),
    ...(input.approved !== undefined ? { approved: input.approved } : {}),
    ...(input.categoryId ? { categoryIds: [input.categoryId] } : {}),
    ...(input.cleared ? { cleared: input.cleared } : {}),
    ...(input.toDate ? { endDate: input.toDate } : {}),
    ...(input.maxAmount !== undefined ? { maxAmountMilliunits: input.maxAmount } : {}),
    ...(input.minAmount !== undefined ? { minAmountMilliunits: input.minAmount } : {}),
    ...(input.payeeId ? { payeeIds: [input.payeeId] } : {}),
    ...(input.fromDate ? { startDate: input.fromDate } : {}),
    ...(input.sort ? { sort: input.sort } : {})
  });
  const sort = input.sort ?? "date_desc";
  const filteredTransactions = transactions
    .filter((transaction) => matchesTransactionFilters(transaction, input))
    .sort((left, right) => compareRows(left, right, sort));
  const includeSummary = input.includeSummary === true || (!hasPaginationControls(input) && shouldPaginateEntries(filteredTransactions, input));

  return {
    status: freshness.stale ? "stale" : "ok",
    data_freshness: dataFreshness,
    data: buildTransactionCollectionResult(filteredTransactions, input, {
      ...(includeSummary ? buildTransactionSummary(filteredTransactions) : {}),
      filters: compactObject({
        from_date: input.fromDate,
        to_date: input.toDate,
        payee_id: input.payeeId,
        account_id: input.accountId,
        category_id: input.categoryId,
        approved: input.approved,
        cleared: input.cleared,
        min_amount: input.minAmount == null ? undefined : formatAmountMilliunits(input.minAmount),
        max_amount: input.maxAmount == null ? undefined : formatAmountMilliunits(input.maxAmount),
        include_transfers: input.includeTransfers ?? false,
        include_summary: input.includeSummary,
        sort
      })
    })
  };
}
