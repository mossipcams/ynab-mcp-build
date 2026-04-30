import type {
  YnabAccountDetail,
  YnabAccountSummary,
  YnabCategoryDetail,
  YnabCategoryGroupSummary,
  YnabClient,
  YnabDefaultPlan,
  YnabMoneyMovement,
  YnabMoneyMovementGroup,
  YnabMoneyMovementGroupsResult,
  YnabMoneyMovementsResult,
  YnabMonthCategoryDetail,
  YnabPayee,
  YnabPayeeLocation,
  YnabPlanDetail,
  YnabPlanMonthDetail,
  YnabPlanMonthSummary,
  YnabPlanSettings,
  YnabPlanSummary,
  YnabScheduledTransaction,
  YnabTransaction,
  YnabUser,
} from "../client.js";

type ReadModelClientOptions = {
  defaultPlanId?: string;
};

type CountRow = {
  count: number;
};

const rowsOrEmpty = <T>(result: { results?: T[] }) => result.results ?? [];

type UserRow = {
  id: string;
  name: string;
};

type PlanRow = {
  id: string;
  name: string;
  last_modified_on?: string | null;
  first_month?: string | null;
  last_month?: string | null;
  deleted?: number | null;
};

type AccountRow = {
  id: string;
  name: string;
  type: string;
  on_budget?: number | null;
  closed?: number | null;
  balance_milliunits?: number | null;
  deleted?: number | null;
};

type CategoryGroupRow = {
  id: string;
  name: string;
  hidden?: number | null;
  deleted?: number | null;
};

type CategoryRow = {
  id: string;
  category_group_id?: string | null;
  category_group_name?: string | null;
  name: string;
  hidden?: number | null;
  deleted?: number | null;
  budgeted_milliunits?: number | null;
  activity_milliunits?: number | null;
  balance_milliunits?: number | null;
  goal_type?: string | null;
  goal_target_milliunits?: number | null;
  goal_under_funded_milliunits?: number | null;
};

type PlanSettingsRow = {
  date_format?: string | null;
  currency_iso_code?: string | null;
  currency_example_format?: string | null;
  currency_decimal_digits?: number | null;
  currency_decimal_separator?: string | null;
  currency_symbol_first?: number | null;
  currency_group_separator?: string | null;
  currency_symbol?: string | null;
  currency_display_symbol?: number | null;
};

type MonthRow = {
  month: string;
  income_milliunits?: number | null;
  budgeted_milliunits?: number | null;
  activity_milliunits?: number | null;
  to_be_budgeted_milliunits?: number | null;
  age_of_money?: number | null;
  deleted?: number | null;
};

type MonthCategoryRow = CategoryRow & {
  category_id: string;
};

type TransactionRow = {
  id: string;
  date: string;
  amount_milliunits: number;
  memo?: string | null;
  payee_id?: string | null;
  payee_name?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  account_id?: string | null;
  account_name?: string | null;
  approved?: number | null;
  cleared?: string | null;
  flag_color?: string | null;
  flag_name?: string | null;
  deleted?: number | null;
  transfer_account_id?: string | null;
  transfer_transaction_id?: string | null;
  matched_transaction_id?: string | null;
  import_id?: string | null;
  import_payee_name?: string | null;
  import_payee_name_original?: string | null;
  debt_transaction_type?: string | null;
};

type SubtransactionRow = {
  id: string;
  transaction_id?: string | null;
  amount_milliunits: number;
  memo?: string | null;
  payee_id?: string | null;
  payee_name?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  transfer_account_id?: string | null;
  transfer_transaction_id?: string | null;
  deleted?: number | null;
};

type ScheduledTransactionRow = {
  id: string;
  date_first: string;
  date_next?: string | null;
  amount_milliunits: number;
  payee_name?: string | null;
  category_name?: string | null;
  account_name?: string | null;
  deleted?: number | null;
};

type PayeeRow = {
  id: string;
  name: string;
  transfer_account_id?: string | null;
  deleted?: number | null;
};

type PayeeLocationRow = {
  id: string;
  payee_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  deleted?: number | null;
};

type MoneyMovementRow = {
  id: string;
  month?: string | null;
  moved_at?: string | null;
  note?: string | null;
  money_movement_group_id?: string | null;
  performed_by_user_id?: string | null;
  from_category_id?: string | null;
  to_category_id?: string | null;
  amount_milliunits: number;
  deleted?: number | null;
};

type MoneyMovementGroupRow = {
  id: string;
  group_created_at: string;
  month: string;
  note?: string | null;
  performed_by_user_id?: string | null;
  deleted?: number | null;
};

function toBoolean(value: number | null | undefined) {
  return value === undefined || value === null ? undefined : value === 1;
}

function toRequiredBoolean(value: number | null | undefined) {
  return value === 1;
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

function first<T>(rows: T[], message: string) {
  const row = rows[0];

  if (!row) {
    throw new Error(message);
  }

  return row;
}

function toPlan(row: PlanRow): YnabPlanSummary {
  return compact({
    id: row.id,
    name: row.name,
    lastModifiedOn: row.last_modified_on ?? undefined,
  });
}

function toAccount(row: AccountRow): YnabAccountSummary {
  return compact({
    id: row.id,
    name: row.name,
    type: row.type,
    closed: toRequiredBoolean(row.closed),
    deleted: toBoolean(row.deleted),
    balance: row.balance_milliunits ?? 0,
  });
}

function toCategorySummary(row: CategoryRow) {
  return compact({
    id: row.id,
    name: row.name,
    hidden: toRequiredBoolean(row.hidden),
    deleted: toRequiredBoolean(row.deleted),
    categoryGroupName: row.category_group_name ?? undefined,
  });
}

function toCategoryDetail(row: CategoryRow): YnabCategoryDetail {
  return compact({
    ...toCategorySummary(row),
    balance: row.balance_milliunits ?? undefined,
    goalType: row.goal_type ?? undefined,
    goalTarget: row.goal_target_milliunits ?? undefined,
  });
}

function toMonthCategory(
  row: MonthCategoryRow,
): NonNullable<YnabPlanMonthDetail["categories"]>[number] {
  return compact({
    id: row.category_id,
    name: row.name,
    budgeted: row.budgeted_milliunits ?? undefined,
    activity: row.activity_milliunits ?? undefined,
    balance: row.balance_milliunits ?? 0,
    deleted: toBoolean(row.deleted),
    hidden: toBoolean(row.hidden),
    goalUnderFunded: row.goal_under_funded_milliunits ?? undefined,
    categoryGroupName: row.category_group_name ?? undefined,
  });
}

function toTransaction(row: TransactionRow): YnabTransaction {
  return compact({
    id: row.id,
    date: row.date,
    amount: row.amount_milliunits,
    memo: row.memo,
    payeeId: row.payee_id,
    payeeName: row.payee_name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    accountId: row.account_id,
    accountName: row.account_name,
    approved: toBoolean(row.approved) ?? null,
    cleared: row.cleared,
    flagColor: row.flag_color,
    flagName: row.flag_name,
    deleted: toBoolean(row.deleted),
    isTransfer: Boolean(row.transfer_account_id),
    transferAccountId: row.transfer_account_id,
    transferTransactionId: row.transfer_transaction_id,
    matchedTransactionId: row.matched_transaction_id,
    importId: row.import_id,
    importPayeeName: row.import_payee_name,
    importPayeeNameOriginal: row.import_payee_name_original,
    debtTransactionType: row.debt_transaction_type,
  });
}

function toSubtransaction(row: SubtransactionRow) {
  return compact({
    id: row.id,
    transactionId: row.transaction_id,
    amount: row.amount_milliunits,
    memo: row.memo,
    payeeId: row.payee_id,
    payeeName: row.payee_name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    transferAccountId: row.transfer_account_id,
    transferTransactionId: row.transfer_transaction_id,
    deleted: toBoolean(row.deleted),
  });
}

function toScheduledTransaction(
  row: ScheduledTransactionRow,
): YnabScheduledTransaction {
  return compact({
    id: row.id,
    dateFirst: row.date_first,
    dateNext: row.date_next,
    amount: row.amount_milliunits,
    payeeName: row.payee_name,
    categoryName: row.category_name,
    accountName: row.account_name,
    deleted: toBoolean(row.deleted),
  });
}

function toPayee(row: PayeeRow): YnabPayee {
  return compact({
    id: row.id,
    name: row.name,
    transferAccountId: row.transfer_account_id,
    deleted: toBoolean(row.deleted),
  });
}

function toPayeeLocation(row: PayeeLocationRow): YnabPayeeLocation {
  return compact({
    id: row.id,
    payeeId: row.payee_id,
    latitude: row.latitude,
    longitude: row.longitude,
    deleted: toBoolean(row.deleted),
  });
}

function toMoneyMovement(row: MoneyMovementRow): YnabMoneyMovement {
  return compact({
    amount: row.amount_milliunits,
    deleted: toBoolean(row.deleted),
    fromCategoryId: row.from_category_id,
    id: row.id,
    moneyMovementGroupId: row.money_movement_group_id,
    month: row.month,
    movedAt: row.moved_at,
    note: row.note,
    performedByUserId: row.performed_by_user_id,
    toCategoryId: row.to_category_id,
  });
}

function toMoneyMovementGroup(
  row: MoneyMovementGroupRow,
): YnabMoneyMovementGroup {
  return compact({
    deleted: toBoolean(row.deleted),
    groupCreatedAt: row.group_created_at,
    id: row.id,
    month: row.month,
    note: row.note,
    performedByUserId: row.performed_by_user_id,
  });
}

export function createYnabReadModelClient(
  database: D1Database,
  options: ReadModelClientOptions = {},
): YnabClient {
  async function all<T>(sql: string, ...params: Array<string | number>) {
    const result = await database
      .prepare(sql)
      .bind(...params)
      .all<T>();

    return rowsOrEmpty(result);
  }

  async function count(sql: string, ...params: Array<string | number>) {
    const row = first(
      await all<CountRow>(sql, ...params),
      "Count query did not return a row.",
    );

    return row.count;
  }

  async function listTransactionRows(
    planId: string,
    extraWhere: string[] = [],
    params: Array<string | number> = [],
  ) {
    return all<TransactionRow>(
      `SELECT id,
              date,
              amount_milliunits,
              memo,
              payee_id,
              payee_name,
              category_id,
              category_name,
              account_id,
              account_name,
              approved,
              cleared,
              flag_color,
              flag_name,
              deleted,
              transfer_account_id,
              transfer_transaction_id,
              matched_transaction_id,
              import_id,
              import_payee_name,
              import_payee_name_original,
              debt_transaction_type
       FROM ynab_transactions
       WHERE plan_id = ?${extraWhere.length ? ` AND ${extraWhere.join(" AND ")}` : ""}
       ORDER BY date DESC, id`,
      planId,
      ...params,
    );
  }

  async function listSubtransactionRows(planId: string, transactionId: string) {
    return all<SubtransactionRow>(
      `SELECT id,
              transaction_id,
              amount_milliunits,
              memo,
              payee_id,
              payee_name,
              category_id,
              category_name,
              transfer_account_id,
              transfer_transaction_id,
              deleted
       FROM ynab_subtransactions
       WHERE plan_id = ? AND transaction_id = ?
       ORDER BY id`,
      planId,
      transactionId,
    );
  }

  return {
    async getUser(): Promise<YnabUser> {
      const row = first(
        await all<UserRow>(
          "SELECT id, name FROM ynab_users ORDER BY updated_at DESC, id LIMIT 1",
        ),
        "No synced YNAB user is available.",
      );

      return {
        id: row.id,
        name: row.name,
      };
    },

    async listPlans() {
      const plans = (
        await all<PlanRow>(
          `SELECT id, name, last_modified_on
         FROM ynab_plans
         WHERE deleted = 0
         ORDER BY name, id`,
        )
      ).map(toPlan);
      const defaultPlan = options.defaultPlanId
        ? plans.find((plan) => plan.id === options.defaultPlanId)
        : null;

      return {
        plans,
        defaultPlan: defaultPlan
          ? ({
              id: defaultPlan.id,
              name: defaultPlan.name,
            } satisfies YnabDefaultPlan)
          : null,
      };
    },

    async getPlan(planId: string): Promise<YnabPlanDetail> {
      const row = first(
        await all<PlanRow>(
          `SELECT id, name, last_modified_on, first_month, last_month
           FROM ynab_plans
           WHERE id = ? AND deleted = 0
           LIMIT 1`,
          planId,
        ),
        `YNAB plan ${planId} was not found in the read model.`,
      );
      const [accountCount, categoryGroupCount, payeeCount] = await Promise.all([
        count(
          "SELECT COUNT(*) AS count FROM ynab_accounts WHERE plan_id = ? AND deleted = 0",
          planId,
        ),
        count(
          "SELECT COUNT(*) AS count FROM ynab_category_groups WHERE plan_id = ? AND deleted = 0",
          planId,
        ),
        count(
          "SELECT COUNT(*) AS count FROM ynab_payees WHERE plan_id = ? AND deleted = 0",
          planId,
        ),
      ]);

      return compact({
        id: row.id,
        name: row.name,
        lastModifiedOn: row.last_modified_on ?? undefined,
        firstMonth: row.first_month ?? undefined,
        lastMonth: row.last_month ?? undefined,
        accountCount,
        categoryGroupCount,
        payeeCount,
      });
    },

    async listCategories(planId: string): Promise<YnabCategoryGroupSummary[]> {
      const [groups, categories] = await Promise.all([
        all<CategoryGroupRow>(
          `SELECT id, name, hidden, deleted
           FROM ynab_category_groups
           WHERE plan_id = ?
           ORDER BY name, id`,
          planId,
        ),
        all<CategoryRow>(
          `SELECT id, category_group_id, category_group_name, name, hidden, deleted
           FROM ynab_categories
           WHERE plan_id = ?
           ORDER BY category_group_name, name, id`,
          planId,
        ),
      ]);
      const categoriesByGroup = new Map<
        string,
        ReturnType<typeof toCategorySummary>[]
      >();

      for (const category of categories) {
        const groupId = category.category_group_id ?? "";
        const existing = categoriesByGroup.get(groupId) ?? [];
        existing.push(toCategorySummary(category));
        categoriesByGroup.set(groupId, existing);
      }

      return groups.map((group) => ({
        id: group.id,
        name: group.name,
        hidden: toRequiredBoolean(group.hidden),
        deleted: toRequiredBoolean(group.deleted),
        categories: categoriesByGroup.get(group.id) ?? [],
      }));
    },

    async getCategory(planId: string, categoryId: string) {
      return toCategoryDetail(
        first(
          await all<CategoryRow>(
            `SELECT id,
                  category_group_name,
                  name,
                  hidden,
                  deleted,
                  balance_milliunits,
                  goal_type,
                  goal_target_milliunits
           FROM ynab_categories
           WHERE plan_id = ? AND id = ?
           LIMIT 1`,
            planId,
            categoryId,
          ),
          `YNAB category ${categoryId} was not found in the read model.`,
        ),
      );
    },

    async getMonthCategory(
      planId: string,
      month: string,
      categoryId: string,
    ): Promise<YnabMonthCategoryDetail> {
      const row = first(
        await all<MonthCategoryRow>(
          `SELECT category_id,
                  category_group_name,
                  name,
                  hidden,
                  deleted,
                  budgeted_milliunits,
                  activity_milliunits,
                  balance_milliunits,
                  goal_type,
                  goal_target_milliunits,
                  goal_under_funded_milliunits
           FROM ynab_month_categories
           WHERE plan_id = ? AND month = ? AND category_id = ?
           LIMIT 1`,
          planId,
          month,
          categoryId,
        ),
        `YNAB month category ${categoryId} was not found in the read model.`,
      );

      return compact({
        id: row.category_id,
        name: row.name,
        hidden: toRequiredBoolean(row.hidden),
        categoryGroupName: row.category_group_name ?? undefined,
        budgeted: row.budgeted_milliunits ?? undefined,
        activity: row.activity_milliunits ?? undefined,
        balance: row.balance_milliunits ?? undefined,
        goalType: row.goal_type ?? undefined,
        goalTarget: row.goal_target_milliunits ?? undefined,
        goalUnderFunded: row.goal_under_funded_milliunits ?? undefined,
      });
    },

    async getPlanSettings(planId: string): Promise<YnabPlanSettings> {
      const row = first(
        await all<PlanSettingsRow>(
          `SELECT date_format,
                  currency_iso_code,
                  currency_example_format,
                  currency_decimal_digits,
                  currency_decimal_separator,
                  currency_symbol_first,
                  currency_group_separator,
                  currency_symbol,
                  currency_display_symbol
           FROM ynab_plan_settings
           WHERE plan_id = ?
           LIMIT 1`,
          planId,
        ),
        `YNAB plan settings for ${planId} were not found in the read model.`,
      );

      return compact({
        dateFormat: row.date_format
          ? {
              format: row.date_format,
            }
          : undefined,
        currencyFormat: compact({
          isoCode: row.currency_iso_code ?? undefined,
          exampleFormat: row.currency_example_format ?? undefined,
          decimalDigits: row.currency_decimal_digits ?? undefined,
          decimalSeparator: row.currency_decimal_separator ?? undefined,
          symbolFirst: toBoolean(row.currency_symbol_first),
          groupSeparator: row.currency_group_separator ?? undefined,
          currencySymbol: row.currency_symbol ?? undefined,
          displaySymbol: toBoolean(row.currency_display_symbol),
        }),
      });
    },

    async listPlanMonths(planId: string): Promise<YnabPlanMonthSummary[]> {
      return (
        await all<MonthRow>(
          `SELECT month,
                income_milliunits,
                budgeted_milliunits,
                activity_milliunits,
                to_be_budgeted_milliunits,
                deleted
         FROM ynab_months
         WHERE plan_id = ?
         ORDER BY month DESC`,
          planId,
        )
      ).map((row) =>
        compact({
          month: row.month,
          income: row.income_milliunits ?? undefined,
          budgeted: row.budgeted_milliunits ?? undefined,
          activity: row.activity_milliunits ?? undefined,
          toBeBudgeted: row.to_be_budgeted_milliunits ?? undefined,
          deleted: toBoolean(row.deleted),
        }),
      );
    },

    async getPlanMonth(
      planId: string,
      month: string,
    ): Promise<YnabPlanMonthDetail> {
      const [monthRow, categories] = await Promise.all([
        all<MonthRow>(
          `SELECT month,
                  income_milliunits,
                  budgeted_milliunits,
                  activity_milliunits,
                  to_be_budgeted_milliunits,
                  age_of_money,
                  deleted
           FROM ynab_months
           WHERE plan_id = ? AND month = ?
           LIMIT 1`,
          planId,
          month,
        ),
        all<MonthCategoryRow>(
          `SELECT category_id,
                  category_group_name,
                  name,
                  budgeted_milliunits,
                  activity_milliunits,
                  balance_milliunits,
                  goal_under_funded_milliunits,
                  hidden,
                  deleted
           FROM ynab_month_categories
           WHERE plan_id = ? AND month = ?
           ORDER BY category_group_name, name, category_id`,
          planId,
          month,
        ),
      ]);
      const row = first(
        monthRow,
        `YNAB month ${month} was not found in the read model.`,
      );
      const mappedCategories = categories.map(toMonthCategory);

      return compact({
        month: row.month,
        income: row.income_milliunits ?? undefined,
        budgeted: row.budgeted_milliunits ?? undefined,
        activity: row.activity_milliunits ?? undefined,
        toBeBudgeted: row.to_be_budgeted_milliunits ?? undefined,
        ageOfMoney: row.age_of_money ?? undefined,
        categoryCount: mappedCategories.length,
        categories: mappedCategories,
      });
    },

    async listAccounts(planId: string): Promise<YnabAccountSummary[]> {
      return (
        await all<AccountRow>(
          `SELECT id, name, type, closed, deleted, balance_milliunits
         FROM ynab_accounts
         WHERE plan_id = ?
         ORDER BY name, id`,
          planId,
        )
      ).map(toAccount);
    },

    async getAccount(
      planId: string,
      accountId: string,
    ): Promise<YnabAccountDetail> {
      const row = first(
        await all<AccountRow>(
          `SELECT id, name, type, on_budget, closed, balance_milliunits
           FROM ynab_accounts
           WHERE plan_id = ? AND id = ?
           LIMIT 1`,
          planId,
          accountId,
        ),
        `YNAB account ${accountId} was not found in the read model.`,
      );

      return compact({
        id: row.id,
        name: row.name,
        type: row.type,
        onBudget: toBoolean(row.on_budget),
        closed: toRequiredBoolean(row.closed),
        balance: row.balance_milliunits ?? undefined,
      });
    },

    async listTransactions(planId: string, fromDate?: string, toDate?: string) {
      const where = [
        ...(fromDate ? ["date >= ?"] : []),
        ...(toDate ? ["date <= ?"] : []),
      ];
      const params = [
        ...(fromDate ? [fromDate] : []),
        ...(toDate ? [toDate] : []),
      ];

      return (await listTransactionRows(planId, where, params)).map(
        toTransaction,
      );
    },

    async listTransactionsByAccount(planId: string, accountId: string) {
      return (
        await listTransactionRows(planId, ["account_id = ?"], [accountId])
      ).map(toTransaction);
    },

    async listTransactionsByCategory(planId: string, categoryId: string) {
      return (
        await listTransactionRows(planId, ["category_id = ?"], [categoryId])
      ).map(toTransaction);
    },

    async listTransactionsByPayee(planId: string, payeeId: string) {
      return (
        await listTransactionRows(planId, ["payee_id = ?"], [payeeId])
      ).map(toTransaction);
    },

    async getTransaction(planId: string, transactionId: string) {
      const transaction = toTransaction(
        first(
          await listTransactionRows(planId, ["id = ?"], [transactionId]),
          `YNAB transaction ${transactionId} was not found in the read model.`,
        ),
      );
      const subtransactions = (
        await listSubtransactionRows(planId, transactionId)
      ).map(toSubtransaction);

      return compact({
        ...transaction,
        subtransactions: subtransactions.length ? subtransactions : undefined,
      });
    },

    async listScheduledTransactions(planId: string) {
      return (
        await all<ScheduledTransactionRow>(
          `SELECT id,
                date_first,
                date_next,
                amount_milliunits,
                payee_name,
                category_name,
                account_name,
                deleted
         FROM ynab_scheduled_transactions
         WHERE plan_id = ?
         ORDER BY date_next, id`,
          planId,
        )
      ).map(toScheduledTransaction);
    },

    async getScheduledTransaction(
      planId: string,
      scheduledTransactionId: string,
    ) {
      return toScheduledTransaction(
        first(
          await all<ScheduledTransactionRow>(
            `SELECT id,
                  date_first,
                  date_next,
                  amount_milliunits,
                  payee_name,
                  category_name,
                  account_name,
                  deleted
           FROM ynab_scheduled_transactions
           WHERE plan_id = ? AND id = ?
           LIMIT 1`,
            planId,
            scheduledTransactionId,
          ),
          `YNAB scheduled transaction ${scheduledTransactionId} was not found in the read model.`,
        ),
      );
    },

    async listPayees(planId: string) {
      return (
        await all<PayeeRow>(
          `SELECT id, name, transfer_account_id, deleted
         FROM ynab_payees
         WHERE plan_id = ?
         ORDER BY name COLLATE NOCASE, id`,
          planId,
        )
      ).map(toPayee);
    },

    async getPayee(planId: string, payeeId: string) {
      return toPayee(
        first(
          await all<PayeeRow>(
            `SELECT id, name, transfer_account_id, deleted
           FROM ynab_payees
           WHERE plan_id = ? AND id = ?
           LIMIT 1`,
            planId,
            payeeId,
          ),
          `YNAB payee ${payeeId} was not found in the read model.`,
        ),
      );
    },

    async listPayeeLocations(planId: string) {
      return (
        await all<PayeeLocationRow>(
          `SELECT id, payee_id, latitude, longitude, deleted
         FROM ynab_payee_locations
         WHERE plan_id = ?
         ORDER BY id`,
          planId,
        )
      ).map(toPayeeLocation);
    },

    async getPayeeLocation(planId: string, payeeLocationId: string) {
      return toPayeeLocation(
        first(
          await all<PayeeLocationRow>(
            `SELECT id, payee_id, latitude, longitude, deleted
           FROM ynab_payee_locations
           WHERE plan_id = ? AND id = ?
           LIMIT 1`,
            planId,
            payeeLocationId,
          ),
          `YNAB payee location ${payeeLocationId} was not found in the read model.`,
        ),
      );
    },

    async getPayeeLocationsByPayee(planId: string, payeeId: string) {
      return (
        await all<PayeeLocationRow>(
          `SELECT id, payee_id, latitude, longitude, deleted
         FROM ynab_payee_locations
         WHERE plan_id = ? AND payee_id = ?
         ORDER BY id`,
          planId,
          payeeId,
        )
      ).map(toPayeeLocation);
    },

    async listMoneyMovements(
      planId: string,
    ): Promise<YnabMoneyMovementsResult> {
      const moneyMovements = (
        await all<MoneyMovementRow>(
          `SELECT id,
                month,
                moved_at,
                note,
                money_movement_group_id,
                performed_by_user_id,
                from_category_id,
                to_category_id,
                amount_milliunits,
                deleted
         FROM ynab_money_movements
         WHERE plan_id = ?
         ORDER BY moved_at DESC, id`,
          planId,
        )
      ).map(toMoneyMovement);

      return {
        moneyMovements,
        serverKnowledge: 0,
      };
    },

    async listMoneyMovementGroups(
      planId: string,
    ): Promise<YnabMoneyMovementGroupsResult> {
      const moneyMovementGroups = (
        await all<MoneyMovementGroupRow>(
          `SELECT id,
                group_created_at,
                month,
                note,
                performed_by_user_id,
                deleted
         FROM ynab_money_movement_groups
         WHERE plan_id = ?
         ORDER BY group_created_at DESC, id`,
          planId,
        )
      ).map(toMoneyMovementGroup);

      return {
        moneyMovementGroups,
        serverKnowledge: 0,
      };
    },
  };
}
