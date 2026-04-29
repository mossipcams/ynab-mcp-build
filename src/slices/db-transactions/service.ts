import type {
  TransactionSearchRow,
  TransactionSummaryResult,
} from "../../platform/ynab/read-model/transactions-repository.js";
import {
  formatAmountMilliunits,
  hasPaginationControls,
  hasProjectionControls,
  projectRecord,
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
  "cleared",
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
      offset?: number;
      sort?: TransactionSort;
    }): Promise<{ rows: TransactionSearchRow[]; totalCount: number }>;
    summarizeTransactions?(input: {
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
      topN?: number;
    }): Promise<TransactionSummaryResult>;
  };
  freshness: {
    getFreshness(
      planId: string,
      requiredEndpoints: readonly string[],
    ): Promise<FreshnessResult>;
  };
};

function resolvePlanId(input: { planId?: string }, defaultPlanId?: string) {
  const inputPlanId = input.planId?.trim();

  if (inputPlanId) {
    return inputPlanId;
  }

  const planId = defaultPlanId?.trim();

  if (!planId) {
    throw new Error(
      "planId is required when YNAB_DEFAULT_PLAN_ID is not configured.",
    );
  }

  return planId;
}

function resolveLimit(limit: number | undefined) {
  return Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
}

function toFreshnessEnvelope(freshness: FreshnessResult) {
  return {
    ...freshness,
    required_endpoints: [...REQUIRED_ENDPOINTS],
  };
}

function isUnhealthy(freshness: FreshnessResult) {
  return (
    freshness.health_status === "never_synced" ||
    freshness.health_status === "unhealthy"
  );
}

function buildReadModelSyncNextAction(planId: string) {
  return {
    code: "sync_read_model",
    message: `Run the scheduled YNAB read-model sync for ${planId}, then retry after endpoints are healthy: ${REQUIRED_ENDPOINTS.join(", ")}.`,
  };
}

function toDisplayTransaction(row: TransactionSearchRow) {
  return Object.fromEntries(
    Object.entries({
      id: row.id,
      date: row.date,
      amount: formatAmountMilliunits(row.amount_milliunits),
      amount_milliunits: row.amount_milliunits,
      memo: row.memo,
      cleared: row.cleared,
      approved:
        row.approved === undefined || row.approved === null
          ? undefined
          : Boolean(row.approved),
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
      deleted: row.deleted ? true : undefined,
    }).filter(([, value]) => value !== undefined),
  );
}

function buildTransactionSummary(rows: TransactionSearchRow[], topN = 5) {
  const categoryRollups = new Map<
    string,
    {
      id?: string;
      name: string;
      amountMilliunits: number;
      transactionCount: number;
    }
  >();
  const payeeRollups = new Map<
    string,
    {
      id?: string;
      name: string;
      amountMilliunits: number;
      transactionCount: number;
    }
  >();
  let inflowMilliunits = 0;
  let outflowMilliunits = 0;

  for (const row of rows) {
    if (row.amount_milliunits >= 0) {
      inflowMilliunits += row.amount_milliunits;
    } else {
      const amountMilliunits = Math.abs(row.amount_milliunits);
      outflowMilliunits += amountMilliunits;

      const categoryKey =
        row.category_id ?? row.category_name ?? "uncategorized";
      const existingCategory = categoryRollups.get(categoryKey);
      if (existingCategory) {
        existingCategory.amountMilliunits += amountMilliunits;
        existingCategory.transactionCount += 1;
      } else {
        categoryRollups.set(categoryKey, {
          ...(row.category_id ? { id: row.category_id } : {}),
          name: row.category_name ?? "Uncategorized",
          amountMilliunits,
          transactionCount: 1,
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
          transactionCount: 1,
        });
      }
    }
  }

  const toTopRollups = (
    entries: Array<{
      id?: string;
      name: string;
      amountMilliunits: number;
      transactionCount: number;
    }>,
  ) =>
    entries
      .sort(
        (left, right) =>
          right.amountMilliunits - left.amountMilliunits ||
          left.name.localeCompare(right.name),
      )
      .slice(0, topN)
      .map((entry) =>
        compactObject({
          id: entry.id,
          name: entry.name,
          amount: formatAmountMilliunits(entry.amountMilliunits),
          transaction_count: entry.transactionCount,
        }),
      );

  return {
    totals: {
      total_inflow: formatAmountMilliunits(inflowMilliunits),
      total_outflow: formatAmountMilliunits(outflowMilliunits),
      net: formatAmountMilliunits(inflowMilliunits - outflowMilliunits),
    },
    top_categories: toTopRollups(Array.from(categoryRollups.values())),
    top_payees: toTopRollups(Array.from(payeeRollups.values())),
  };
}

function formatTransactionSummary(summary: TransactionSummaryResult) {
  const toRollups = (
    entries: Array<{
      id?: string;
      name: string;
      amountMilliunits: number;
      transactionCount: number;
    }>,
  ) =>
    entries.map((entry) =>
      compactObject({
        id: entry.id,
        name: entry.name,
        amount: formatAmountMilliunits(entry.amountMilliunits),
        transaction_count: entry.transactionCount,
      }),
    );

  return {
    totals: {
      total_inflow: formatAmountMilliunits(summary.totals.inflowMilliunits),
      total_outflow: formatAmountMilliunits(summary.totals.outflowMilliunits),
      net: formatAmountMilliunits(
        summary.totals.inflowMilliunits - summary.totals.outflowMilliunits,
      ),
    },
    top_categories: toRollups(summary.topCategories),
    top_payees: toRollups(summary.topPayees),
  };
}

function buildTransactionCollectionResult(
  rows: TransactionSearchRow[],
  totalCount: number,
  input: DbTransactionSearchInput,
  extra: Record<string, unknown> = {},
) {
  const displayTransactions = rows.map(toDisplayTransaction);
  const transactions = hasProjectionControls(input)
    ? displayTransactions.map((transaction) =>
        projectRecord(transaction, transactionFields, input),
      )
    : displayTransactions;

  if (!hasPaginationControls(input) && rows.length === totalCount) {
    return {
      transactions,
      match_count: totalCount,
      ...extra,
    };
  }

  const offset = Math.max(input.offset ?? 0, 0);
  const requestedLimit = Math.max(input.limit ?? DEFAULT_LIMIT, 1);

  return {
    transactions,
    match_count: totalCount,
    offset,
    limit: requestedLimit,
    returned_count: rows.length,
    has_more: offset + rows.length < totalCount,
    ...extra,
  };
}

export async function searchTransactions(
  dependencies: DbTransactionServiceDependencies,
  input: DbTransactionSearchInput,
) {
  const planId = resolvePlanId(input, dependencies.defaultPlanId);
  const freshness = await dependencies.freshness.getFreshness(
    planId,
    REQUIRED_ENDPOINTS,
  );
  const dataFreshness = toFreshnessEnvelope(freshness);

  if (isUnhealthy(freshness)) {
    return {
      status: "unhealthy",
      data_freshness: dataFreshness,
      next_action: buildReadModelSyncNextAction(planId),
      data: null,
    };
  }

  const repositoryFilters = {
    includeDeleted: input.includeDeleted ?? false,
    includeTransfers: input.includeTransfers ?? false,
    planId,
    ...(input.accountId ? { accountIds: [input.accountId] } : {}),
    ...(input.approved !== undefined ? { approved: input.approved } : {}),
    ...(input.categoryId ? { categoryIds: [input.categoryId] } : {}),
    ...(input.cleared ? { cleared: input.cleared } : {}),
    ...(input.toDate ? { endDate: input.toDate } : {}),
    ...(input.maxAmount !== undefined
      ? { maxAmountMilliunits: input.maxAmount }
      : {}),
    ...(input.minAmount !== undefined
      ? { minAmountMilliunits: input.minAmount }
      : {}),
    ...(input.payeeId ? { payeeIds: [input.payeeId] } : {}),
    ...(input.fromDate ? { startDate: input.fromDate } : {}),
  };
  const transactionPage =
    await dependencies.transactionsRepository.searchTransactions({
      ...repositoryFilters,
      limit: resolveLimit(input.limit),
      offset: Math.max(input.offset ?? 0, 0),
      ...(input.sort ? { sort: input.sort } : {}),
    });
  const sort = input.sort ?? "date_desc";
  const includeSummary =
    input.includeSummary === true ||
    (!hasPaginationControls(input) &&
      transactionPage.totalCount > transactionPage.rows.length);
  const summary = includeSummary
    ? dependencies.transactionsRepository.summarizeTransactions
      ? formatTransactionSummary(
          await dependencies.transactionsRepository.summarizeTransactions({
            ...repositoryFilters,
            topN: 5,
          }),
        )
      : buildTransactionSummary(transactionPage.rows)
    : {};

  return {
    status: freshness.stale ? "stale" : "ok",
    data_freshness: dataFreshness,
    data: buildTransactionCollectionResult(
      transactionPage.rows,
      transactionPage.totalCount,
      input,
      {
        ...summary,
        filters: compactObject({
          from_date: input.fromDate,
          to_date: input.toDate,
          payee_id: input.payeeId,
          account_id: input.accountId,
          category_id: input.categoryId,
          approved: input.approved,
          cleared: input.cleared,
          min_amount:
            input.minAmount == null
              ? undefined
              : formatAmountMilliunits(input.minAmount),
          max_amount:
            input.maxAmount == null
              ? undefined
              : formatAmountMilliunits(input.maxAmount),
          include_transfers: input.includeTransfers ?? false,
          include_summary: input.includeSummary,
          sort,
        }),
      },
    ),
  };
}
