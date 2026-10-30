-- Backfill: hide the import half of YNAB matched pairs (see isHiddenMatchedImport).
UPDATE ynab_transactions
SET deleted = 1
WHERE deleted = 0
  AND matched_transaction_id IS NOT NULL
  AND import_payee_name LIKE '{%';
