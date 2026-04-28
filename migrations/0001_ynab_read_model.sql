CREATE TABLE IF NOT EXISTS ynab_sync_state (
  plan_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  server_knowledge INTEGER,
  last_successful_sync_at TEXT,
  last_failed_sync_at TEXT,
  health_status TEXT NOT NULL DEFAULT 'never_synced',
  last_error TEXT,
  rows_upserted_last_run INTEGER NOT NULL DEFAULT 0,
  rows_deleted_last_run INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT,
  lease_expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (plan_id, endpoint)
);

CREATE TABLE IF NOT EXISTS ynab_sync_runs (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  server_knowledge_before INTEGER,
  server_knowledge_after INTEGER,
  rows_upserted INTEGER NOT NULL DEFAULT 0,
  rows_deleted INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

CREATE TABLE IF NOT EXISTS ynab_users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ynab_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  last_modified_on TEXT,
  first_month TEXT,
  last_month TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ynab_plan_settings (
  plan_id TEXT PRIMARY KEY,
  date_format TEXT,
  currency_iso_code TEXT,
  currency_example_format TEXT,
  currency_decimal_digits INTEGER,
  currency_decimal_separator TEXT,
  currency_symbol_first INTEGER,
  currency_group_separator TEXT,
  currency_symbol TEXT,
  currency_display_symbol INTEGER,
  synced_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ynab_accounts (
  plan_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  on_budget INTEGER,
  closed INTEGER NOT NULL DEFAULT 0,
  balance_milliunits INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (plan_id, id)
);

CREATE TABLE IF NOT EXISTS ynab_category_groups (
  plan_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (plan_id, id)
);

CREATE TABLE IF NOT EXISTS ynab_categories (
  plan_id TEXT NOT NULL,
  id TEXT NOT NULL,
  category_group_id TEXT,
  category_group_name TEXT,
  name TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  budgeted_milliunits INTEGER,
  activity_milliunits INTEGER,
  balance_milliunits INTEGER,
  goal_type TEXT,
  goal_target_milliunits INTEGER,
  goal_target_date TEXT,
  goal_target_month TEXT,
  goal_needs_whole_amount INTEGER,
  goal_snoozed_at TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (plan_id, id)
);

CREATE TABLE IF NOT EXISTS ynab_months (
  plan_id TEXT NOT NULL,
  month TEXT NOT NULL,
  income_milliunits INTEGER,
  budgeted_milliunits INTEGER,
  activity_milliunits INTEGER,
  to_be_budgeted_milliunits INTEGER,
  age_of_money INTEGER,
  deleted INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (plan_id, month)
);

CREATE TABLE IF NOT EXISTS ynab_month_categories (
  plan_id TEXT NOT NULL,
  month TEXT NOT NULL,
  category_id TEXT NOT NULL,
  category_group_id TEXT,
  category_group_name TEXT,
  name TEXT NOT NULL,
  budgeted_milliunits INTEGER NOT NULL DEFAULT 0,
  activity_milliunits INTEGER NOT NULL DEFAULT 0,
  balance_milliunits INTEGER NOT NULL DEFAULT 0,
  goal_under_funded_milliunits INTEGER,
  hidden INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (plan_id, month, category_id)
);

CREATE TABLE IF NOT EXISTS ynab_payees (
  plan_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  transfer_account_id TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (plan_id, id)
);

CREATE TABLE IF NOT EXISTS ynab_payee_locations (
  plan_id TEXT NOT NULL,
  id TEXT NOT NULL,
  payee_id TEXT,
  latitude REAL,
  longitude REAL,
  deleted INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (plan_id, id)
);

CREATE TABLE IF NOT EXISTS ynab_transactions (
  plan_id TEXT NOT NULL,
  id TEXT NOT NULL,
  date TEXT NOT NULL,
  amount_milliunits INTEGER NOT NULL,
  memo TEXT,
  cleared TEXT,
  approved INTEGER,
  flag_name TEXT,
  account_id TEXT,
  account_name TEXT,
  payee_id TEXT,
  payee_name TEXT,
  category_id TEXT,
  category_name TEXT,
  transfer_account_id TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (plan_id, id)
);

CREATE TABLE IF NOT EXISTS ynab_subtransactions (
  plan_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  id TEXT NOT NULL,
  amount_milliunits INTEGER NOT NULL,
  memo TEXT,
  payee_id TEXT,
  payee_name TEXT,
  category_id TEXT,
  category_name TEXT,
  transfer_account_id TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (plan_id, transaction_id, id)
);

CREATE TABLE IF NOT EXISTS ynab_scheduled_transactions (
  plan_id TEXT NOT NULL,
  id TEXT NOT NULL,
  date_first TEXT NOT NULL,
  date_next TEXT,
  frequency TEXT,
  amount_milliunits INTEGER NOT NULL,
  memo TEXT,
  account_id TEXT,
  account_name TEXT,
  payee_id TEXT,
  payee_name TEXT,
  category_id TEXT,
  category_name TEXT,
  transfer_account_id TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (plan_id, id)
);

CREATE TABLE IF NOT EXISTS ynab_scheduled_subtransactions (
  plan_id TEXT NOT NULL,
  scheduled_transaction_id TEXT NOT NULL,
  id TEXT NOT NULL,
  amount_milliunits INTEGER NOT NULL,
  memo TEXT,
  payee_id TEXT,
  payee_name TEXT,
  category_id TEXT,
  category_name TEXT,
  transfer_account_id TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (plan_id, scheduled_transaction_id, id)
);

CREATE TABLE IF NOT EXISTS ynab_money_movements (
  plan_id TEXT NOT NULL,
  id TEXT NOT NULL,
  date TEXT NOT NULL,
  amount_milliunits INTEGER NOT NULL,
  from_account_id TEXT,
  from_account_name TEXT,
  to_account_id TEXT,
  to_account_name TEXT,
  payee_id TEXT,
  payee_name TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (plan_id, id)
);

CREATE TABLE IF NOT EXISTS ynab_money_movement_groups (
  plan_id TEXT NOT NULL,
  id TEXT NOT NULL,
  from_account_id TEXT,
  from_account_name TEXT,
  to_account_id TEXT,
  to_account_name TEXT,
  total_amount_milliunits INTEGER NOT NULL DEFAULT 0,
  movement_count INTEGER NOT NULL DEFAULT 0,
  latest_date TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (plan_id, id)
);

CREATE INDEX IF NOT EXISTS idx_ynab_transactions_plan_date
  ON ynab_transactions (plan_id, date DESC, id);

CREATE INDEX IF NOT EXISTS idx_ynab_transactions_account_date
  ON ynab_transactions (plan_id, account_id, date DESC, id);

CREATE INDEX IF NOT EXISTS idx_ynab_transactions_category_date
  ON ynab_transactions (plan_id, category_id, date DESC, id);

CREATE INDEX IF NOT EXISTS idx_ynab_transactions_payee_date
  ON ynab_transactions (plan_id, payee_id, date DESC, id);

CREATE INDEX IF NOT EXISTS idx_ynab_transactions_deleted
  ON ynab_transactions (plan_id, deleted);

CREATE INDEX IF NOT EXISTS idx_ynab_month_categories_plan_month_category
  ON ynab_month_categories (plan_id, month, category_id);

CREATE INDEX IF NOT EXISTS idx_ynab_payees_plan_name
  ON ynab_payees (plan_id, name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_ynab_accounts_plan
  ON ynab_accounts (plan_id);

CREATE INDEX IF NOT EXISTS idx_ynab_categories_plan
  ON ynab_categories (plan_id);

CREATE INDEX IF NOT EXISTS idx_ynab_categories_group
  ON ynab_categories (plan_id, category_group_id);

CREATE INDEX IF NOT EXISTS idx_ynab_scheduled_transactions_next
  ON ynab_scheduled_transactions (plan_id, date_next);

CREATE INDEX IF NOT EXISTS idx_ynab_money_movements_plan_date
  ON ynab_money_movements (plan_id, date DESC, id);

CREATE INDEX IF NOT EXISTS idx_ynab_money_movements_from_account
  ON ynab_money_movements (plan_id, from_account_id);

CREATE INDEX IF NOT EXISTS idx_ynab_money_movements_to_account
  ON ynab_money_movements (plan_id, to_account_id);
