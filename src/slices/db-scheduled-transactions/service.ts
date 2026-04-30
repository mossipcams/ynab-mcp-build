import type {
  ScheduledTransactionRow,
  ScheduledTransactionSearchResult,
  SearchScheduledTransactionsInput,
} from "../../platform/ynab/read-model/scheduled-transactions-repository.js";
import {
  DEFAULT_LIMIT,
  formatAmountMilliunits,
  hasProjectionControls,
  projectRecord,
} from "../../shared/collections.js";
import { compactObject } from "../../shared/object.js";

const scheduledTransactionFields = [
  "date_first",
  "date_next",
  "amount",
  "payee_name",
  "category_name",
  "account_name",
] as const;

export type SearchDbScheduledTransactionsInput = {
  planId?: string;
  fromDate?: string;
  toDate?: string;
  accountId?: string;
  categoryId?: string;
  payeeId?: string;
  limit?: number;
  offset?: number;
  fields?: Array<(typeof scheduledTransactionFields)[number]>;
  includeIds?: boolean;
};

export type GetDbScheduledTransactionInput = {
  planId?: string;
  scheduledTransactionId: string;
};

type DbScheduledTransactionDependencies = {
  defaultPlanId?: string;
  scheduledTransactionsRepository: {
    getScheduledTransaction(input: {
      planId: string;
      scheduledTransactionId: string;
    }): Promise<ScheduledTransactionRow | null>;
    listScheduledTransactions(
      input: SearchScheduledTransactionsInput,
    ): Promise<ScheduledTransactionSearchResult>;
    usesServerPagination?: boolean;
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

function toCompactScheduledTransaction(row: ScheduledTransactionRow) {
  return compactObject({
    id: row.id,
    date_first: row.date_first,
    date_next: row.date_next,
    amount: formatAmountMilliunits(row.amount_milliunits),
    account_name: row.account_name,
    payee_name: row.payee_name,
    category_name: row.category_name,
  });
}

function toDisplayScheduledTransaction(row: ScheduledTransactionRow) {
  return compactObject({
    id: row.id,
    date_first: row.date_first,
    date_next: row.date_next,
    frequency: row.frequency,
    amount: formatAmountMilliunits(row.amount_milliunits),
    memo: row.memo,
    flag_color: row.flag_color,
    flag_name: row.flag_name,
    account_id: row.account_id,
    account_name: row.account_name,
    payee_id: row.payee_id,
    payee_name: row.payee_name,
    category_id: row.category_id,
    category_name: row.category_name,
    transfer_account_id: row.transfer_account_id,
  });
}

function buildPaginationMetadata(
  input: {
    limit: number;
    offset?: number;
  },
  returnedCount: number,
  totalCount: number,
) {
  const offset = input.offset ?? 0;

  return {
    limit: input.limit,
    offset,
    returned_count: returnedCount,
    has_more: offset + returnedCount < totalCount,
  };
}

function shouldIncludePaginationMetadata(
  input: Pick<SearchDbScheduledTransactionsInput, "limit" | "offset">,
  totalCount: number,
) {
  return (
    input.limit !== undefined ||
    input.offset !== undefined ||
    totalCount > DEFAULT_LIMIT
  );
}

function getEffectivePagination(
  input: Pick<SearchDbScheduledTransactionsInput, "limit" | "offset">,
) {
  return {
    limit: input.limit ?? DEFAULT_LIMIT,
    ...(input.offset !== undefined ? { offset: input.offset } : {}),
  };
}

function buildSearchInput(
  input: SearchDbScheduledTransactionsInput,
  planId: string,
  options: { useServerPagination: boolean },
): SearchScheduledTransactionsInput {
  const searchInput: SearchScheduledTransactionsInput = { planId };

  if (input.fromDate) {
    searchInput.fromDate = input.fromDate;
  }

  if (input.toDate) {
    searchInput.toDate = input.toDate;
  }

  if (input.accountId) {
    searchInput.accountId = input.accountId;
  }

  if (input.categoryId) {
    searchInput.categoryId = input.categoryId;
  }

  if (input.payeeId) {
    searchInput.payeeId = input.payeeId;
  }

  if (options.useServerPagination) {
    const pagination = getEffectivePagination(input);

    searchInput.limit = pagination.limit;

    if (pagination.offset !== undefined) {
      searchInput.offset = pagination.offset;
    }

    return searchInput;
  }

  if (input.limit !== undefined) {
    searchInput.limit = input.limit;
  }

  if (input.offset !== undefined) {
    searchInput.offset = input.offset;
  }

  return searchInput;
}

export async function searchDbScheduledTransactions(
  dependencies: DbScheduledTransactionDependencies,
  input: SearchDbScheduledTransactionsInput,
) {
  const planId = resolvePlanId(input, dependencies.defaultPlanId);
  const useServerPagination =
    dependencies.scheduledTransactionsRepository.usesServerPagination === true;
  const result =
    await dependencies.scheduledTransactionsRepository.listScheduledTransactions(
      buildSearchInput(input, planId, { useServerPagination }),
    );
  const scheduledTransactions = result.rows.map(toCompactScheduledTransaction);
  const paginationMetadata = shouldIncludePaginationMetadata(
    input,
    result.totalCount,
  )
    ? buildPaginationMetadata(
        getEffectivePagination(input),
        scheduledTransactions.length,
        result.totalCount,
      )
    : {};

  if (!hasProjectionControls(input)) {
    return {
      scheduled_transactions: scheduledTransactions,
      scheduled_transaction_count: result.totalCount,
      ...paginationMetadata,
    };
  }

  return {
    scheduled_transactions: scheduledTransactions.map((transaction) =>
      projectRecord(transaction, scheduledTransactionFields, input),
    ),
    scheduled_transaction_count: result.totalCount,
    ...paginationMetadata,
  };
}

export async function getDbScheduledTransaction(
  dependencies: DbScheduledTransactionDependencies,
  input: GetDbScheduledTransactionInput,
) {
  const planId = resolvePlanId(input, dependencies.defaultPlanId);
  const scheduledTransaction =
    await dependencies.scheduledTransactionsRepository.getScheduledTransaction({
      planId,
      scheduledTransactionId: input.scheduledTransactionId,
    });

  if (!scheduledTransaction) {
    throw new Error(
      `YNAB scheduled transaction ${input.scheduledTransactionId} was not found in the read model.`,
    );
  }

  return {
    scheduled_transaction: toDisplayScheduledTransaction(scheduledTransaction),
  };
}
