import type { YnabClient, YnabTransaction } from "../../platform/ynab/client.js";
import {
  formatAmountMilliunits,
  hasPaginationControls,
  hasProjectionControls,
  paginateEntries,
  projectRecord,
  shouldPaginateEntries
} from "../../shared/collections.js";
import { compactObject } from "../../shared/object.js";
import { resolvePlanId } from "../../shared/plans.js";

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

export type ListTransactionsInput = {
  planId?: string;
  limit?: number;
  offset?: number;
  fields?: TransactionField[];
  includeIds?: boolean;
};

export type GetTransactionInput = {
  planId?: string;
  transactionId: string;
};

export type SearchTransactionsInput = ListTransactionsInput & {
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
  sort?: TransactionSort;
};

export type GetTransactionsByMonthInput = ListTransactionsInput & {
  planId?: string;
  month: string;
};

export type GetTransactionsByAccountInput = ListTransactionsInput & {
  planId?: string;
  accountId: string;
};

export type GetTransactionsByCategoryInput = ListTransactionsInput & {
  planId?: string;
  categoryId: string;
};

export type GetTransactionsByPayeeInput = ListTransactionsInput & {
  planId?: string;
  payeeId: string;
};

export type ListScheduledTransactionsInput = {
  planId?: string;
  limit?: number;
  offset?: number;
  fields?: Array<"date_first" | "date_next" | "amount" | "payee_name" | "category_name" | "account_name">;
  includeIds?: boolean;
};

export type GetScheduledTransactionInput = {
  planId?: string;
  scheduledTransactionId: string;
};

type DisplayTransaction = {
  id: string;
  date: string;
  amount: string;
  payee_name?: string | null;
  category_name?: string | null;
  account_name?: string | null;
  approved?: boolean | null;
  cleared?: string | null;
};

function toDisplayTransaction(transaction: YnabTransaction): DisplayTransaction {
  return {
    id: transaction.id,
    date: transaction.date,
    amount: formatAmountMilliunits(transaction.amount),
    payee_name: transaction.payeeName,
    category_name: transaction.categoryName,
    account_name: transaction.accountName,
    approved: transaction.approved,
    cleared: transaction.cleared
  };
}

function compareTransactions(left: YnabTransaction, right: YnabTransaction, sort: TransactionSort) {
  switch (sort) {
    case "date_asc":
      return left.date.localeCompare(right.date) || left.id.localeCompare(right.id);
    case "date_desc":
      return right.date.localeCompare(left.date) || left.id.localeCompare(right.id);
    case "amount_asc":
      return left.amount - right.amount || right.date.localeCompare(left.date) || left.id.localeCompare(right.id);
    case "amount_desc":
      return right.amount - left.amount || right.date.localeCompare(left.date) || left.id.localeCompare(right.id);
  }
}

function buildTransactionCollectionResult(
  transactions: YnabTransaction[],
  input: ListTransactionsInput,
  totalKey: "transaction_count" | "match_count",
  extra: Record<string, unknown> = {}
) {
  const displayTransactions = transactions.map(toDisplayTransaction);
  const shouldPaginate = shouldPaginateEntries(displayTransactions, input);

  if (!shouldPaginate && !hasProjectionControls(input)) {
    return {
      transactions: displayTransactions,
      [totalKey]: transactions.length,
      ...extra
    };
  }

  if (!shouldPaginate) {
    return {
      transactions: displayTransactions.map((transaction) => projectRecord(transaction, transactionFields, input)),
      [totalKey]: transactions.length,
      ...extra
    };
  }

  const pagedTransactions = paginateEntries(displayTransactions, input);

  return {
    transactions: hasProjectionControls(input)
      ? pagedTransactions.entries.map((transaction) => projectRecord(transaction, transactionFields, input))
      : pagedTransactions.entries,
    [totalKey]: transactions.length,
    ...pagedTransactions.metadata,
    ...extra
  };
}

function matchesTransactionFilters(transaction: YnabTransaction, input: SearchTransactionsInput) {
  return [
    input.includeTransfers === true || !transaction.transferAccountId,
    !input.toDate || transaction.date <= input.toDate,
    !input.payeeId || transaction.payeeId === input.payeeId,
    !input.accountId || transaction.accountId === input.accountId,
    !input.categoryId || transaction.categoryId === input.categoryId,
    input.approved === undefined || transaction.approved === input.approved,
    !input.cleared || transaction.cleared === input.cleared,
    input.minAmount === undefined || transaction.amount >= input.minAmount,
    input.maxAmount === undefined || transaction.amount <= input.maxAmount
  ].every(Boolean);
}

function buildTransactionSummary(transactions: YnabTransaction[], topN = 5) {
  const categoryRollups = new Map<string, { id?: string; name: string; amountMilliunits: number; transactionCount: number }>();
  const payeeRollups = new Map<string, { id?: string; name: string; amountMilliunits: number; transactionCount: number }>();
  let inflowMilliunits = 0;
  let outflowMilliunits = 0;

  for (const transaction of transactions) {
    if (transaction.amount >= 0) {
      inflowMilliunits += transaction.amount;
    } else {
      const amountMilliunits = Math.abs(transaction.amount);
      outflowMilliunits += amountMilliunits;

      const categoryKey = transaction.categoryId ?? transaction.categoryName ?? "uncategorized";
      const existingCategory = categoryRollups.get(categoryKey);
      if (existingCategory) {
        existingCategory.amountMilliunits += amountMilliunits;
        existingCategory.transactionCount += 1;
      } else {
        categoryRollups.set(categoryKey, {
          id: transaction.categoryId ?? undefined,
          name: transaction.categoryName ?? "Uncategorized",
          amountMilliunits,
          transactionCount: 1
        });
      }

      const payeeKey = transaction.payeeId ?? transaction.payeeName ?? "unknown";
      const existingPayee = payeeRollups.get(payeeKey);
      if (existingPayee) {
        existingPayee.amountMilliunits += amountMilliunits;
        existingPayee.transactionCount += 1;
      } else {
        payeeRollups.set(payeeKey, {
          id: transaction.payeeId ?? undefined,
          name: transaction.payeeName ?? "Unknown Payee",
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

export async function listTransactions(ynabClient: YnabClient, input: ListTransactionsInput) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const transactions = (await ynabClient.listTransactions(planId, undefined))
    .filter((transaction) => !transaction.deleted)
    .sort((left, right) => compareTransactions(left, right, "date_desc"));

  return buildTransactionCollectionResult(transactions, input, "transaction_count");
}

export async function getTransaction(ynabClient: YnabClient, input: GetTransactionInput) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const transaction = await ynabClient.getTransaction(planId, input.transactionId);

  return {
    transaction: compactObject({
      id: transaction.id,
      date: transaction.date,
      amount: formatAmountMilliunits(transaction.amount),
      payee_name: transaction.payeeName,
      category_name: transaction.categoryName,
      account_name: transaction.accountName,
      approved: transaction.approved,
      cleared: transaction.cleared
    })
  };
}

export async function searchTransactions(ynabClient: YnabClient, input: SearchTransactionsInput) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const sort = input.sort ?? "date_desc";
  const transactions = (await ynabClient.listTransactions(planId, input.fromDate))
    .filter((transaction) => !transaction.deleted)
    .filter((transaction) => matchesTransactionFilters(transaction, input))
    .sort((left, right) => compareTransactions(left, right, sort));
  const includeSummary = input.includeSummary === true || (!hasPaginationControls(input) && shouldPaginateEntries(transactions, input));

  return buildTransactionCollectionResult(transactions, input, "match_count", {
    ...(includeSummary ? buildTransactionSummary(transactions) : {}),
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
  });
}

export async function getTransactionsByMonth(ynabClient: YnabClient, input: GetTransactionsByMonthInput) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const monthPrefix = input.month.slice(0, 7);
  const transactions = (await ynabClient.listTransactions(planId, input.month))
    .filter((transaction) => !transaction.deleted)
    .filter((transaction) => transaction.date.startsWith(monthPrefix))
    .sort((left, right) => compareTransactions(left, right, "date_desc"));

  return buildTransactionCollectionResult(transactions, input, "transaction_count");
}

async function getTransactionsBySelector(
  ynabClient: YnabClient,
  input: ListTransactionsInput & { planId?: string },
  loadTransactions: (planId: string) => Promise<YnabTransaction[]>
) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const transactions = (await loadTransactions(planId))
    .filter((transaction) => !transaction.deleted)
    .sort((left, right) => compareTransactions(left, right, "date_desc"));

  return buildTransactionCollectionResult(transactions, input, "transaction_count");
}

export async function getTransactionsByAccount(ynabClient: YnabClient, input: GetTransactionsByAccountInput) {
  return getTransactionsBySelector(
    ynabClient,
    input,
    (planId) => ynabClient.listTransactionsByAccount(planId, input.accountId)
  );
}

export async function getTransactionsByCategory(ynabClient: YnabClient, input: GetTransactionsByCategoryInput) {
  return getTransactionsBySelector(
    ynabClient,
    input,
    (planId) => ynabClient.listTransactionsByCategory(planId, input.categoryId)
  );
}

export async function getTransactionsByPayee(ynabClient: YnabClient, input: GetTransactionsByPayeeInput) {
  return getTransactionsBySelector(
    ynabClient,
    input,
    (planId) => ynabClient.listTransactionsByPayee(planId, input.payeeId)
  );
}

const scheduledTransactionFields = [
  "date_first",
  "date_next",
  "amount",
  "payee_name",
  "category_name",
  "account_name"
] as const;

export async function listScheduledTransactions(ynabClient: YnabClient, input: ListScheduledTransactionsInput) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const scheduledTransactions = (await ynabClient.listScheduledTransactions(planId))
    .filter((transaction) => !transaction.deleted)
    .map((transaction) => ({
      id: transaction.id,
      date_first: transaction.dateFirst,
      date_next: transaction.dateNext,
      amount: formatAmountMilliunits(transaction.amount),
      payee_name: transaction.payeeName,
      category_name: transaction.categoryName,
      account_name: transaction.accountName
    }));

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
      projectRecord(transaction, scheduledTransactionFields, input)
    ),
    scheduled_transaction_count: scheduledTransactions.length,
    ...pagedTransactions.metadata
  };
}

export async function getScheduledTransaction(ynabClient: YnabClient, input: GetScheduledTransactionInput) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const transaction = await ynabClient.getScheduledTransaction(planId, input.scheduledTransactionId);

  return {
    scheduled_transaction: compactObject({
      id: transaction.id,
      date_first: transaction.dateFirst,
      date_next: transaction.dateNext,
      amount: formatAmountMilliunits(transaction.amount),
      payee_name: transaction.payeeName,
      category_name: transaction.categoryName,
      account_name: transaction.accountName
    })
  };
}
