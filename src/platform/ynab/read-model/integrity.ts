type CountRow = {
  count: number;
};

type MonthIntegrityInput = {
  month: string;
  planId: string;
};

type DiagnosticsInput = {
  month?: string;
  planId: string;
};

type MonthIntegrityDiagnostics = {
  categoryRowCount: number;
  missingMonthCategoryReferenceCount: number;
  monthCategoryRowCount: number;
  monthRowCount: number;
  transactionCategoryReferenceCount: number;
};

type NestedIntegrityDiagnostics = {
  missingMoneyMovementGroupReferenceCount: number;
  missingScheduledSubtransactionParentReferenceCount: number;
  missingSubtransactionParentReferenceCount: number;
  moneyMovementGroupRowCount: number;
  moneyMovementRowCount: number;
  scheduledSubtransactionRowCount: number;
  scheduledTransactionRowCount: number;
  subtransactionRowCount: number;
  transactionRowCount: number;
};

type IntegrityResult = {
  diagnostics: MonthIntegrityDiagnostics;
  health_status: "ok" | "unhealthy";
  warning: string | null;
};

function rowsOrEmpty<T>(result: { results?: T[] }) {
  return result.results ?? [];
}

async function countRows(
  database: D1Database,
  sql: string,
  ...params: unknown[]
) {
  const result = await database
    .prepare(sql)
    .bind(...params)
    .all<CountRow>();
  const row = rowsOrEmpty(result)[0];

  return typeof row?.count === "number" ? row.count : 0;
}

function addMonths(month: string, offset: number) {
  const [yearPart, monthPart] = month.slice(0, 7).split("-");
  const date = new Date(
    Date.UTC(Number(yearPart), Number(monthPart) - 1 + offset, 1),
  );

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function createReadModelIntegrity(database: D1Database) {
  async function getMonthDiagnostics(
    input: MonthIntegrityInput,
  ): Promise<MonthIntegrityDiagnostics> {
    const nextMonth = addMonths(input.month, 1);
    const [
      monthRowCount,
      monthCategoryRowCount,
      categoryRowCount,
      transactionCategoryReferenceCount,
      missingMonthCategoryReferenceCount,
    ] = await Promise.all([
      countRows(
        database,
        `SELECT COUNT(*) AS count
         FROM ynab_months
         WHERE plan_id = ? AND month = ? AND deleted = 0`,
        input.planId,
        input.month,
      ),
      countRows(
        database,
        `SELECT COUNT(*) AS count
         FROM ynab_month_categories
         WHERE plan_id = ? AND month = ? AND deleted = 0`,
        input.planId,
        input.month,
      ),
      countRows(
        database,
        `SELECT COUNT(*) AS count
         FROM ynab_categories
         WHERE plan_id = ? AND deleted = 0`,
        input.planId,
      ),
      countRows(
        database,
        `SELECT COUNT(*) AS count
         FROM ynab_transactions
         WHERE plan_id = ?
           AND date >= ?
           AND date < ?
           AND category_id IS NOT NULL
           AND deleted = 0`,
        input.planId,
        input.month,
        nextMonth,
      ),
      countRows(
        database,
        `SELECT COUNT(*) AS count
         FROM (
           SELECT transaction.category_id
           FROM
             ynab_transactions transaction
           LEFT JOIN ynab_month_categories month_category
             ON month_category.plan_id = transaction.plan_id
            AND month_category.month = ?
            AND month_category.category_id = transaction.category_id
            AND month_category.deleted = 0
           WHERE transaction.plan_id = ?
             AND transaction.date >= ?
             AND transaction.date < ?
             AND transaction.category_id IS NOT NULL
             AND transaction.deleted = 0
             AND month_category.category_id IS NULL
         ) missing_transaction_category_refs`,
        input.month,
        input.planId,
        input.month,
        nextMonth,
      ),
    ]);

    return {
      categoryRowCount,
      missingMonthCategoryReferenceCount,
      monthCategoryRowCount,
      monthRowCount,
      transactionCategoryReferenceCount,
    };
  }

  async function getNestedDiagnostics(planId: string) {
    const [
      transactionRowCount,
      subtransactionRowCount,
      missingSubtransactionParentReferenceCount,
      scheduledTransactionRowCount,
      scheduledSubtransactionRowCount,
      missingScheduledSubtransactionParentReferenceCount,
      moneyMovementRowCount,
      moneyMovementGroupRowCount,
      missingMoneyMovementGroupReferenceCount,
    ] = await Promise.all([
      countRows(
        database,
        `SELECT COUNT(*) AS count
         FROM ynab_transactions
         WHERE plan_id = ? AND deleted = 0`,
        planId,
      ),
      countRows(
        database,
        `SELECT COUNT(*) AS count
         FROM ynab_subtransactions
         WHERE plan_id = ? AND deleted = 0`,
        planId,
      ),
      countRows(
        database,
        `SELECT COUNT(*) AS count
         FROM (
           SELECT subtransaction.id
           FROM
             ynab_subtransactions subtransaction
           LEFT JOIN ynab_transactions transaction
             ON transaction.plan_id = subtransaction.plan_id
            AND transaction.id = subtransaction.transaction_id
            AND transaction.deleted = 0
           WHERE subtransaction.plan_id = ?
             AND subtransaction.deleted = 0
             AND transaction.id IS NULL
         ) missing_subtransaction_parent_refs`,
        planId,
      ),
      countRows(
        database,
        `SELECT COUNT(*) AS count
         FROM ynab_scheduled_transactions
         WHERE plan_id = ? AND deleted = 0`,
        planId,
      ),
      countRows(
        database,
        `SELECT COUNT(*) AS count
         FROM ynab_scheduled_subtransactions
         WHERE plan_id = ? AND deleted = 0`,
        planId,
      ),
      countRows(
        database,
        `SELECT COUNT(*) AS count
         FROM (
           SELECT subtransaction.id
           FROM
             ynab_scheduled_subtransactions subtransaction
           LEFT JOIN ynab_scheduled_transactions scheduled_transaction
             ON scheduled_transaction.plan_id = subtransaction.plan_id
            AND scheduled_transaction.id = subtransaction.scheduled_transaction_id
            AND scheduled_transaction.deleted = 0
           WHERE subtransaction.plan_id = ?
             AND subtransaction.deleted = 0
             AND scheduled_transaction.id IS NULL
         ) missing_scheduled_subtransaction_parent_refs`,
        planId,
      ),
      countRows(
        database,
        `SELECT COUNT(*) AS count
         FROM ynab_money_movements
         WHERE plan_id = ? AND deleted = 0`,
        planId,
      ),
      countRows(
        database,
        `SELECT COUNT(*) AS count
         FROM ynab_money_movement_groups
         WHERE plan_id = ? AND deleted = 0`,
        planId,
      ),
      countRows(
        database,
        `SELECT COUNT(*) AS count
         FROM (
           SELECT movement.id
           FROM ynab_money_movements movement
           LEFT JOIN ynab_money_movement_groups movement_group
             ON movement_group.plan_id = movement.plan_id
            AND movement_group.id = movement.money_movement_group_id
            AND movement_group.deleted = 0
           WHERE movement.plan_id = ?
             AND movement.deleted = 0
             AND movement.money_movement_group_id IS NOT NULL
             AND movement_group.id IS NULL
         ) missing_money_movement_group_refs`,
        planId,
      ),
    ]);

    return {
      missingMoneyMovementGroupReferenceCount,
      missingScheduledSubtransactionParentReferenceCount,
      missingSubtransactionParentReferenceCount,
      moneyMovementGroupRowCount,
      moneyMovementRowCount,
      scheduledSubtransactionRowCount,
      scheduledTransactionRowCount,
      subtransactionRowCount,
      transactionRowCount,
    };
  }

  return {
    async getDiagnostics(input: DiagnosticsInput): Promise<{
      month?: MonthIntegrityDiagnostics;
      nested: NestedIntegrityDiagnostics;
    }> {
      const [month, nested] = await Promise.all([
        input.month
          ? getMonthDiagnostics({ month: input.month, planId: input.planId })
          : Promise.resolve(undefined),
        getNestedDiagnostics(input.planId),
      ]);

      return {
        ...(month ? { month } : {}),
        nested,
      };
    },

    async getMonthCategoryIntegrity(
      input: MonthIntegrityInput,
    ): Promise<IntegrityResult> {
      const diagnostics = await getMonthDiagnostics(input);
      const hasBrokenPopulatedMonth =
        diagnostics.monthRowCount > 0 &&
        diagnostics.categoryRowCount > 0 &&
        diagnostics.transactionCategoryReferenceCount > 0 &&
        diagnostics.monthCategoryRowCount === 0;

      if (hasBrokenPopulatedMonth) {
        return {
          diagnostics,
          health_status: "unhealthy",
          warning: `Month ${input.month} has synced month/category/transaction data but no month-category rows.`,
        };
      }

      return {
        diagnostics,
        health_status: "ok",
        warning: null,
      };
    },
  };
}
