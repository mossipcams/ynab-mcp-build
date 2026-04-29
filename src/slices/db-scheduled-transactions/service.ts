import type { ScheduledTransactionRow } from "../../platform/ynab/read-model/scheduled-transactions-repository.js";
import {
  formatAmountMilliunits,
  hasProjectionControls,
  paginateEntries,
  projectRecord,
  shouldPaginateEntries
} from "../../shared/collections.js";
import { compactObject } from "../../shared/object.js";

const scheduledTransactionFields = [
  "date_first",
  "date_next",
  "amount",
  "payee_name",
  "category_name",
  "account_name"
] as const;

export type ListDbScheduledTransactionsInput = {
  planId?: string;
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
    listScheduledTransactions(input: { planId: string }): Promise<ScheduledTransactionRow[]>;
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
    transfer_account_id: row.transfer_account_id
  });
}

export async function listDbScheduledTransactions(
  dependencies: DbScheduledTransactionDependencies,
  input: ListDbScheduledTransactionsInput
) {
  const planId = resolvePlanId(input, dependencies.defaultPlanId);
  const scheduledTransactions = (await dependencies.scheduledTransactionsRepository.listScheduledTransactions({
    planId
  })).map(toDisplayScheduledTransaction);
  const shouldPaginate = shouldPaginateEntries(scheduledTransactions, input);

  if (!shouldPaginate && !hasProjectionControls(input)) {
    return {
      scheduled_transactions: scheduledTransactions,
      scheduled_transaction_count: scheduledTransactions.length
    };
  }

  if (!shouldPaginate) {
    return {
      scheduled_transactions: scheduledTransactions.map((transaction) =>
        projectRecord(transaction, scheduledTransactionFields, input)
      ),
      scheduled_transaction_count: scheduledTransactions.length
    };
  }

  const pagedTransactions = paginateEntries(scheduledTransactions, input);

  return {
    scheduled_transactions: pagedTransactions.entries.map((transaction) =>
      hasProjectionControls(input)
        ? projectRecord(transaction, scheduledTransactionFields, input)
        : transaction
    ),
    scheduled_transaction_count: scheduledTransactions.length,
    ...pagedTransactions.metadata
  };
}

export async function getDbScheduledTransaction(
  dependencies: DbScheduledTransactionDependencies,
  input: GetDbScheduledTransactionInput
) {
  const planId = resolvePlanId(input, dependencies.defaultPlanId);
  const scheduledTransaction = await dependencies.scheduledTransactionsRepository.getScheduledTransaction({
    planId,
    scheduledTransactionId: input.scheduledTransactionId
  });

  if (!scheduledTransaction) {
    throw new Error(`YNAB scheduled transaction ${input.scheduledTransactionId} was not found in the read model.`);
  }

  return {
    scheduled_transaction: toDisplayScheduledTransaction(scheduledTransaction)
  };
}
