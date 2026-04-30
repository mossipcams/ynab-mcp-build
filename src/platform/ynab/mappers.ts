export type YnabSubtransactionRecord = {
  amount: number;
};

export type YnabTransactionRecordInput = {
  account_id?: string | null | undefined;
  account_name?: string | null | undefined;
  amount: number;
  approved?: boolean | null | undefined;
  category_id?: string | null | undefined;
  category_name?: string | null | undefined;
  cleared?: string | null | undefined;
  date: string;
  debt_transaction_type?: string | null | undefined;
  deleted?: boolean | undefined;
  flag_color?: string | null | undefined;
  flag_name?: string | null | undefined;
  id: string;
  import_id?: string | null | undefined;
  import_payee_name?: string | null | undefined;
  import_payee_name_original?: string | null | undefined;
  matched_transaction_id?: string | null | undefined;
  memo?: string | null | undefined;
  payee_id?: string | null | undefined;
  payee_name?: string | null | undefined;
  transfer_account_id?: string | null | undefined;
  transfer_transaction_id?: string | null | undefined;
  subtransactions?:
    | Array<{
        id: string;
        transaction_id?: string | null | undefined;
        amount: number;
        memo?: string | null | undefined;
        payee_id?: string | null | undefined;
        payee_name?: string | null | undefined;
        category_id?: string | null | undefined;
        category_name?: string | null | undefined;
        transfer_account_id?: string | null | undefined;
        transfer_transaction_id?: string | null | undefined;
        deleted?: boolean | undefined;
      }>
    | undefined;
};

export function dollarsToMilliunits(amount: number) {
  return Math.round(amount * 1000);
}

export function milliunitsToDollars(amount: number) {
  return amount / 1000;
}

export function sumSubtransactionAmounts(
  subtransactions: YnabSubtransactionRecord[],
) {
  return subtransactions.reduce(
    (sum, subtransaction) => sum + subtransaction.amount,
    0,
  );
}

type Compact<T extends Record<string, unknown>> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K];
} & {
  [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<
    T[K],
    undefined
  >;
};

function compact<T extends Record<string, unknown>>(entry: T): Compact<T> {
  return Object.fromEntries(
    Object.entries(entry).filter(([, value]) => value !== undefined),
  ) as Compact<T>;
}

export function mapTransactionRecord(transaction: YnabTransactionRecordInput) {
  return compact({
    id: transaction.id,
    date: transaction.date,
    amount: transaction.amount,
    memo: transaction.memo,
    payeeId: transaction.payee_id,
    payeeName: transaction.payee_name,
    categoryId: transaction.category_id,
    categoryName: transaction.category_name,
    accountId: transaction.account_id,
    accountName: transaction.account_name,
    approved: transaction.approved,
    cleared: transaction.cleared,
    flagColor: transaction.flag_color,
    flagName: transaction.flag_name,
    deleted: transaction.deleted,
    transferAccountId: transaction.transfer_account_id,
    transferTransactionId: transaction.transfer_transaction_id,
    matchedTransactionId: transaction.matched_transaction_id,
    importId: transaction.import_id,
    importPayeeName: transaction.import_payee_name,
    importPayeeNameOriginal: transaction.import_payee_name_original,
    debtTransactionType: transaction.debt_transaction_type,
    subtransactions: transaction.subtransactions?.map((subtransaction) =>
      compact({
        id: subtransaction.id,
        transactionId: subtransaction.transaction_id,
        amount: subtransaction.amount,
        memo: subtransaction.memo,
        payeeId: subtransaction.payee_id,
        payeeName: subtransaction.payee_name,
        categoryId: subtransaction.category_id,
        categoryName: subtransaction.category_name,
        transferAccountId: subtransaction.transfer_account_id,
        transferTransactionId: subtransaction.transfer_transaction_id,
        deleted: subtransaction.deleted,
      }),
    ),
    isTransfer: Boolean(transaction.transfer_account_id),
  });
}

export function filterActiveTransactions<T extends { deleted?: boolean }>(
  transactions: T[],
) {
  return transactions.filter((transaction) => !transaction.deleted);
}
