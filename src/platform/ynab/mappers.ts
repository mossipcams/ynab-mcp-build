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
  deleted?: boolean;
  id: string;
  payee_id?: string | null;
  payee_name?: string | null;
  transfer_account_id?: string | null;
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
    payeeId: transaction.payee_id,
    payeeName: transaction.payee_name,
    categoryId: transaction.category_id,
    categoryName: transaction.category_name,
    accountId: transaction.account_id,
    accountName: transaction.account_name,
    approved: transaction.approved,
    cleared: transaction.cleared,
    deleted: transaction.deleted,
    transferAccountId: transaction.transfer_account_id,
    isTransfer: Boolean(transaction.transfer_account_id)
  };
}

export function filterActiveTransactions<T extends { deleted?: boolean }>(transactions: T[]) {
  return transactions.filter((transaction) => !transaction.deleted);
}
