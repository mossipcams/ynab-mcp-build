import { formatAmountMilliunits } from "../../shared/collections.js";
import type { TransactionSearchRow } from "../../platform/ynab/read-model/transactions-repository.js";

const REQUIRED_ENDPOINTS = ["transactions"] as const;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export type DbTransactionSearchInput = {
  planId?: string;
  fromDate?: string;
  toDate?: string;
  payeeId?: string;
  accountId?: string;
  categoryId?: string;
  minAmount?: number;
  maxAmount?: number;
  includeDeleted?: boolean;
  limit?: number;
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
      minAmountMilliunits?: number;
      maxAmountMilliunits?: number;
      includeDeleted?: boolean;
      limit: number;
    }): Promise<TransactionSearchRow[]>;
  };
  freshness: {
    getFreshness(planId: string, requiredEndpoints: readonly string[]): Promise<FreshnessResult>;
  };
};

function resolvePlanId(input: { planId?: string }, defaultPlanId?: string) {
  const planId = input.planId ?? defaultPlanId;

  if (!planId) {
    throw new Error("planId is required when YNAB_DEFAULT_PLAN_ID is not configured.");
  }

  return planId;
}

function resolveLimit(limit: number | undefined) {
  return Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
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
    account_id: row.account_id,
    account_name: row.account_name,
    payee_id: row.payee_id,
    payee_name: row.payee_name,
    category_id: row.category_id,
    category_name: row.category_name,
    transfer_account_id: row.transfer_account_id,
    deleted: row.deleted ? true : undefined
  }).filter(([, value]) => value !== undefined));
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
    accountIds: input.accountId ? [input.accountId] : undefined,
    categoryIds: input.categoryId ? [input.categoryId] : undefined,
    endDate: input.toDate,
    includeDeleted: input.includeDeleted ?? false,
    limit: resolveLimit(input.limit),
    maxAmountMilliunits: input.maxAmount,
    minAmountMilliunits: input.minAmount,
    payeeIds: input.payeeId ? [input.payeeId] : undefined,
    payeeSearch: undefined,
    planId,
    startDate: input.fromDate
  });

  return {
    status: freshness.stale ? "stale" : "ok",
    data_freshness: dataFreshness,
    data: {
      transactions: transactions.map(toDisplayTransaction),
      match_count: transactions.length
    }
  };
}
