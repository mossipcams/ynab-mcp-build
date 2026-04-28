export type YnabSubtransactionRecord = {
  amount: number;
};

export type YnabTransactionRecordInput = {
  account_id?: string | null;
  account_name?: string | null;
  amount: number;
  approved?: boolean | null;
  category_id?: string | null;
  category_name?: string | null;
  cleared?: string | null;
  date: string;
  debt_transaction_type?: string | null;
  deleted?: boolean;
  flag_color?: string | null;
  flag_name?: string | null;
  id: string;
  import_id?: string | null;
  import_payee_name?: string | null;
  import_payee_name_original?: string | null;
  matched_transaction_id?: string | null;
  memo?: string | null;
  payee_id?: string | null;
  payee_name?: string | null;
  transfer_account_id?: string | null;
  transfer_transaction_id?: string | null;
  subtransactions?: Array<{
    id: string;
    transaction_id?: string | null;
    amount: number;
    memo?: string | null;
    payee_id?: string | null;
    payee_name?: string | null;
    category_id?: string | null;
    category_name?: string | null;
    transfer_account_id?: string | null;
    transfer_transaction_id?: string | null;
    deleted?: boolean;
  }>;
};

export function dollarsToMilliunits(amount: number) {
  return Math.round(amount * 1000);
}

export function milliunitsToDollars(amount: number) {
  return amount / 1000;
}

export function sumSubtransactionAmounts(subtransactions: YnabSubtransactionRecord[]) {
  return subtransactions.reduce((sum, subtransaction) => sum + subtransaction.amount, 0);
}

export function mapTransactionRecord(transaction: YnabTransactionRecordInput) {
  return {
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
    subtransactions: transaction.subtransactions?.map((subtransaction) => ({
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
      deleted: subtransaction.deleted
    })),
    isTransfer: Boolean(transaction.transfer_account_id)
  };
}

export function filterActiveTransactions<T extends { deleted?: boolean }>(transactions: T[]) {
  return transactions.filter((transaction) => !transaction.deleted);
}
