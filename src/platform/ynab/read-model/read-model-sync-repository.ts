import type {
  YnabAccountSummary,
  YnabCategoryGroupSummary,
  YnabMoneyMovement,
  YnabMoneyMovementGroup,
  YnabPayee,
  YnabPayeeLocation,
  YnabPlanMonthDetail,
  YnabScheduledTransaction
} from "../client.js";

type UpsertResult = {
  rowsUpserted: number;
};

type UpsertCategoryGroupsResult = {
  categoryGroupsUpserted: number;
  categoriesUpserted: number;
};

type UpsertMonthsResult = {
  monthCategoriesUpserted: number;
  monthsUpserted: number;
};

function toIntegerBoolean(value: boolean | null | undefined) {
  if (value === undefined || value === null) {
    return null;
  }

  return value ? 1 : 0;
}

async function runBatch(database: D1Database, statements: D1PreparedStatement[]): Promise<void> {
  if (statements.length > 0) {
    await database.batch(statements);
  }
}

export function createReadModelSyncRepository(database: D1Database) {
  return {
    async upsertAccounts(input: {
      planId: string;
      accounts: YnabAccountSummary[];
      syncedAt: string;
    }): Promise<UpsertResult> {
      const statements = input.accounts.map((account) =>
        database
          .prepare(
            `INSERT INTO ynab_accounts (
               plan_id,
               id,
               name,
               type,
               on_budget,
               closed,
               note,
               balance_milliunits,
               cleared_balance_milliunits,
               uncleared_balance_milliunits,
               transfer_payee_id,
               direct_import_linked,
               direct_import_in_error,
               last_reconciled_at,
               deleted,
               synced_at,
               updated_at
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(plan_id, id) DO UPDATE SET
               name = excluded.name,
               type = excluded.type,
               on_budget = excluded.on_budget,
               closed = excluded.closed,
               note = excluded.note,
               balance_milliunits = excluded.balance_milliunits,
               cleared_balance_milliunits = excluded.cleared_balance_milliunits,
               uncleared_balance_milliunits = excluded.uncleared_balance_milliunits,
               transfer_payee_id = excluded.transfer_payee_id,
               direct_import_linked = excluded.direct_import_linked,
               direct_import_in_error = excluded.direct_import_in_error,
               last_reconciled_at = excluded.last_reconciled_at,
               deleted = excluded.deleted,
               synced_at = excluded.synced_at,
               updated_at = excluded.updated_at`
          )
          .bind(
            input.planId,
            account.id,
            account.name,
            account.type,
            toIntegerBoolean(account.onBudget),
            account.closed ? 1 : 0,
            account.note ?? null,
            account.balance,
            account.clearedBalance ?? 0,
            account.unclearedBalance ?? 0,
            account.transferPayeeId ?? null,
            toIntegerBoolean(account.directImportLinked),
            toIntegerBoolean(account.directImportInError),
            account.lastReconciledAt ?? null,
            account.deleted ? 1 : 0,
            input.syncedAt,
            input.syncedAt
          )
      );

      await runBatch(database, statements);

      return { rowsUpserted: input.accounts.length };
    },

    async upsertCategoryGroups(input: {
      planId: string;
      categoryGroups: YnabCategoryGroupSummary[];
      syncedAt: string;
    }): Promise<UpsertCategoryGroupsResult> {
      const groupStatements = input.categoryGroups.map((group) =>
        database
          .prepare(
            `INSERT INTO ynab_category_groups (
               plan_id,
               id,
               name,
               hidden,
               deleted,
               synced_at,
               updated_at
             )
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(plan_id, id) DO UPDATE SET
               name = excluded.name,
               hidden = excluded.hidden,
               deleted = excluded.deleted,
               synced_at = excluded.synced_at,
               updated_at = excluded.updated_at`
          )
          .bind(
            input.planId,
            group.id,
            group.name,
            group.hidden ? 1 : 0,
            group.deleted ? 1 : 0,
            input.syncedAt,
            input.syncedAt
          )
      );
      const categoryStatements = input.categoryGroups.flatMap((group) =>
        group.categories.map((category) =>
          database
            .prepare(
              `INSERT INTO ynab_categories (
                 plan_id,
                 id,
                 category_group_id,
                 category_group_name,
                 original_category_group_id,
                 name,
                 note,
                 hidden,
                 budgeted_milliunits,
                 activity_milliunits,
                 balance_milliunits,
                 goal_type,
                 goal_target_milliunits,
                 goal_target_date,
                 goal_target_month,
                 goal_needs_whole_amount,
                 goal_day,
                 goal_cadence,
                 goal_cadence_frequency,
                 goal_creation_month,
                 goal_percentage_complete,
                 goal_months_to_budget,
                 goal_under_funded_milliunits,
                 goal_overall_funded_milliunits,
                 goal_overall_left_milliunits,
                 goal_snoozed_at,
                 deleted,
                 synced_at,
                 updated_at
               )
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(plan_id, id) DO UPDATE SET
                 category_group_id = excluded.category_group_id,
                 category_group_name = excluded.category_group_name,
                 original_category_group_id = excluded.original_category_group_id,
                 name = excluded.name,
                 note = excluded.note,
                 hidden = excluded.hidden,
                 budgeted_milliunits = excluded.budgeted_milliunits,
                 activity_milliunits = excluded.activity_milliunits,
                 balance_milliunits = excluded.balance_milliunits,
                 goal_type = excluded.goal_type,
                 goal_target_milliunits = excluded.goal_target_milliunits,
                 goal_target_date = excluded.goal_target_date,
                 goal_target_month = excluded.goal_target_month,
                 goal_needs_whole_amount = excluded.goal_needs_whole_amount,
                 goal_day = excluded.goal_day,
                 goal_cadence = excluded.goal_cadence,
                 goal_cadence_frequency = excluded.goal_cadence_frequency,
                 goal_creation_month = excluded.goal_creation_month,
                 goal_percentage_complete = excluded.goal_percentage_complete,
                 goal_months_to_budget = excluded.goal_months_to_budget,
                 goal_under_funded_milliunits = excluded.goal_under_funded_milliunits,
                 goal_overall_funded_milliunits = excluded.goal_overall_funded_milliunits,
                 goal_overall_left_milliunits = excluded.goal_overall_left_milliunits,
                 goal_snoozed_at = excluded.goal_snoozed_at,
                 deleted = excluded.deleted,
                 synced_at = excluded.synced_at,
                 updated_at = excluded.updated_at`
            )
            .bind(
              input.planId,
              category.id,
              category.categoryGroupId ?? group.id,
              category.categoryGroupName ?? group.name,
              category.originalCategoryGroupId ?? null,
              category.name,
              category.note ?? null,
              category.hidden ? 1 : 0,
              category.budgeted ?? null,
              category.activity ?? null,
              category.balance ?? null,
              category.goalType ?? null,
              category.goalTarget ?? null,
              category.goalTargetDate ?? null,
              category.goalTargetMonth ?? null,
              toIntegerBoolean(category.goalNeedsWholeAmount),
              category.goalDay ?? null,
              category.goalCadence ?? null,
              category.goalCadenceFrequency ?? null,
              category.goalCreationMonth ?? null,
              category.goalPercentageComplete ?? null,
              category.goalMonthsToBudget ?? null,
              category.goalUnderFunded ?? null,
              category.goalOverallFunded ?? null,
              category.goalOverallLeft ?? null,
              category.goalSnoozedAt ?? null,
              category.deleted ? 1 : 0,
              input.syncedAt,
              input.syncedAt
            )
        )
      );

      await runBatch(database, [...groupStatements, ...categoryStatements]);

      return {
        categoriesUpserted: categoryStatements.length,
        categoryGroupsUpserted: groupStatements.length
      };
    },

    async upsertMonths(input: {
      planId: string;
      months: YnabPlanMonthDetail[];
      syncedAt: string;
    }): Promise<UpsertMonthsResult> {
      const monthStatements = input.months.map((month) =>
        database
          .prepare(
            `INSERT INTO ynab_months (
               plan_id,
               month,
               note,
               income_milliunits,
               budgeted_milliunits,
               activity_milliunits,
               to_be_budgeted_milliunits,
               age_of_money,
               deleted,
               synced_at,
               updated_at
             )
             VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(plan_id, month) DO UPDATE SET
               note = excluded.note,
               income_milliunits = excluded.income_milliunits,
               budgeted_milliunits = excluded.budgeted_milliunits,
               activity_milliunits = excluded.activity_milliunits,
               to_be_budgeted_milliunits = excluded.to_be_budgeted_milliunits,
               age_of_money = excluded.age_of_money,
               deleted = excluded.deleted,
               synced_at = excluded.synced_at,
               updated_at = excluded.updated_at`
          )
          .bind(
            input.planId,
            month.month,
            month.income ?? null,
            month.budgeted ?? null,
            month.activity ?? null,
            month.toBeBudgeted ?? null,
            month.ageOfMoney ?? null,
            month.deleted ? 1 : 0,
            input.syncedAt,
            input.syncedAt
          )
      );
      const monthCategoryStatements = input.months.flatMap((month) =>
        (month.categories ?? []).map((category) =>
          database
            .prepare(
              `INSERT INTO ynab_month_categories (
                 plan_id,
                 month,
                 category_id,
                 category_group_id,
                 category_group_name,
                 original_category_group_id,
                 name,
                 note,
                 budgeted_milliunits,
                 activity_milliunits,
                 balance_milliunits,
                 goal_under_funded_milliunits,
                 goal_type,
                 goal_target_milliunits,
                 goal_target_date,
                 goal_target_month,
                 goal_needs_whole_amount,
                 goal_day,
                 goal_cadence,
                 goal_cadence_frequency,
                 goal_creation_month,
                 goal_percentage_complete,
                 goal_months_to_budget,
                 goal_overall_funded_milliunits,
                 goal_overall_left_milliunits,
                 goal_snoozed_at,
                 hidden,
                 deleted,
                 synced_at,
                 updated_at
               )
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(plan_id, month, category_id) DO UPDATE SET
                 category_group_id = excluded.category_group_id,
                 category_group_name = excluded.category_group_name,
                 original_category_group_id = excluded.original_category_group_id,
                 name = excluded.name,
                 note = excluded.note,
                 budgeted_milliunits = excluded.budgeted_milliunits,
                 activity_milliunits = excluded.activity_milliunits,
                 balance_milliunits = excluded.balance_milliunits,
                 goal_under_funded_milliunits = excluded.goal_under_funded_milliunits,
                 goal_type = excluded.goal_type,
                 goal_target_milliunits = excluded.goal_target_milliunits,
                 goal_target_date = excluded.goal_target_date,
                 goal_target_month = excluded.goal_target_month,
                 goal_needs_whole_amount = excluded.goal_needs_whole_amount,
                 goal_day = excluded.goal_day,
                 goal_cadence = excluded.goal_cadence,
                 goal_cadence_frequency = excluded.goal_cadence_frequency,
                 goal_creation_month = excluded.goal_creation_month,
                 goal_percentage_complete = excluded.goal_percentage_complete,
                 goal_months_to_budget = excluded.goal_months_to_budget,
                 goal_overall_funded_milliunits = excluded.goal_overall_funded_milliunits,
                 goal_overall_left_milliunits = excluded.goal_overall_left_milliunits,
                 goal_snoozed_at = excluded.goal_snoozed_at,
                 hidden = excluded.hidden,
                 deleted = excluded.deleted,
                 synced_at = excluded.synced_at,
                 updated_at = excluded.updated_at`
            )
            .bind(
              input.planId,
              month.month,
              category.id,
              category.categoryGroupId ?? null,
              category.categoryGroupName ?? null,
              category.originalCategoryGroupId ?? null,
              category.name,
              category.note ?? null,
              category.budgeted ?? 0,
              category.activity ?? 0,
              category.balance,
              category.goalUnderFunded ?? null,
              category.goalType ?? null,
              category.goalTarget ?? null,
              category.goalTargetDate ?? null,
              category.goalTargetMonth ?? null,
              toIntegerBoolean(category.goalNeedsWholeAmount),
              category.goalDay ?? null,
              category.goalCadence ?? null,
              category.goalCadenceFrequency ?? null,
              category.goalCreationMonth ?? null,
              category.goalPercentageComplete ?? null,
              category.goalMonthsToBudget ?? null,
              category.goalOverallFunded ?? null,
              category.goalOverallLeft ?? null,
              category.goalSnoozedAt ?? null,
              category.hidden ? 1 : 0,
              category.deleted ? 1 : 0,
              input.syncedAt,
              input.syncedAt
            )
        )
      );

      await runBatch(database, [...monthStatements, ...monthCategoryStatements]);

      return {
        monthCategoriesUpserted: monthCategoryStatements.length,
        monthsUpserted: monthStatements.length
      };
    },

    async upsertPayees(input: {
      planId: string;
      payees: YnabPayee[];
      syncedAt: string;
    }): Promise<UpsertResult> {
      const statements = input.payees.map((payee) =>
        database
          .prepare(
            `INSERT INTO ynab_payees (
               plan_id,
               id,
               name,
               transfer_account_id,
               deleted,
               synced_at,
               updated_at
             )
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(plan_id, id) DO UPDATE SET
               name = excluded.name,
               transfer_account_id = excluded.transfer_account_id,
               deleted = excluded.deleted,
               synced_at = excluded.synced_at,
               updated_at = excluded.updated_at`
          )
          .bind(
            input.planId,
            payee.id,
            payee.name,
            payee.transferAccountId ?? null,
            payee.deleted ? 1 : 0,
            input.syncedAt,
            input.syncedAt
          )
      );

      await runBatch(database, statements);

      return { rowsUpserted: input.payees.length };
    },

    async upsertPayeeLocations(input: {
      planId: string;
      locations: YnabPayeeLocation[];
      syncedAt: string;
    }): Promise<UpsertResult> {
      const statements = input.locations.map((location) =>
        database
          .prepare(
            `INSERT INTO ynab_payee_locations (
               plan_id,
               id,
               payee_id,
               latitude,
               longitude,
               deleted,
               synced_at,
               updated_at
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(plan_id, id) DO UPDATE SET
               payee_id = excluded.payee_id,
               latitude = excluded.latitude,
               longitude = excluded.longitude,
               deleted = excluded.deleted,
               synced_at = excluded.synced_at,
               updated_at = excluded.updated_at`
          )
          .bind(
            input.planId,
            location.id,
            location.payeeId ?? null,
            location.latitude ?? null,
            location.longitude ?? null,
            location.deleted ? 1 : 0,
            input.syncedAt,
            input.syncedAt
          )
      );

      await runBatch(database, statements);

      return { rowsUpserted: input.locations.length };
    },

    async upsertScheduledTransactions(input: {
      planId: string;
      scheduledTransactions: YnabScheduledTransaction[];
      syncedAt: string;
    }): Promise<UpsertResult> {
      const statements = input.scheduledTransactions.flatMap((transaction) => {
        const transactionStatement = database
          .prepare(
            `INSERT INTO ynab_scheduled_transactions (
               plan_id,
               id,
               date_first,
               date_next,
               frequency,
               amount_milliunits,
               memo,
               flag_color,
               flag_name,
               account_id,
               account_name,
               payee_id,
               payee_name,
               category_id,
               category_name,
               transfer_account_id,
               deleted,
               synced_at,
               updated_at
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(plan_id, id) DO UPDATE SET
               date_first = excluded.date_first,
               date_next = excluded.date_next,
               frequency = excluded.frequency,
               amount_milliunits = excluded.amount_milliunits,
               memo = excluded.memo,
               flag_color = excluded.flag_color,
               flag_name = excluded.flag_name,
               account_id = excluded.account_id,
               account_name = excluded.account_name,
               payee_id = excluded.payee_id,
               payee_name = excluded.payee_name,
               category_id = excluded.category_id,
               category_name = excluded.category_name,
               transfer_account_id = excluded.transfer_account_id,
               deleted = excluded.deleted,
               synced_at = excluded.synced_at,
               updated_at = excluded.updated_at`
          )
          .bind(
            input.planId,
            transaction.id,
            transaction.dateFirst,
            transaction.dateNext ?? null,
            transaction.frequency ?? null,
            transaction.amount,
            transaction.memo ?? null,
            transaction.flagColor ?? null,
            transaction.flagName ?? null,
            transaction.accountId ?? null,
            transaction.accountName ?? null,
            transaction.payeeId ?? null,
            transaction.payeeName ?? null,
            transaction.categoryId ?? null,
            transaction.categoryName ?? null,
            transaction.transferAccountId ?? null,
            transaction.deleted ? 1 : 0,
            input.syncedAt,
            input.syncedAt
          );
        const subtransactionStatements = (transaction.subtransactions ?? []).map((subtransaction) =>
          database
            .prepare(
              `INSERT INTO ynab_scheduled_subtransactions (
                 plan_id,
                 scheduled_transaction_id,
                 id,
                 amount_milliunits,
                 memo,
                 payee_id,
                 payee_name,
                 category_id,
                 category_name,
                 transfer_account_id,
                 deleted,
                 synced_at,
                 updated_at
               )
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(plan_id, scheduled_transaction_id, id) DO UPDATE SET
                 amount_milliunits = excluded.amount_milliunits,
                 memo = excluded.memo,
                 payee_id = excluded.payee_id,
                 payee_name = excluded.payee_name,
                 category_id = excluded.category_id,
                 category_name = excluded.category_name,
                 transfer_account_id = excluded.transfer_account_id,
                 deleted = excluded.deleted,
                 synced_at = excluded.synced_at,
                 updated_at = excluded.updated_at`
            )
            .bind(
              input.planId,
              subtransaction.scheduledTransactionId ?? transaction.id,
              subtransaction.id,
              subtransaction.amount,
              subtransaction.memo ?? null,
              subtransaction.payeeId ?? null,
              subtransaction.payeeName ?? null,
              subtransaction.categoryId ?? null,
              subtransaction.categoryName ?? null,
              subtransaction.transferAccountId ?? null,
              subtransaction.deleted ? 1 : 0,
              input.syncedAt,
              input.syncedAt
            )
        );

        return [transactionStatement, ...subtransactionStatements];
      });

      await runBatch(database, statements);

      return { rowsUpserted: input.scheduledTransactions.length };
    },

    async upsertMoneyMovements(input: {
      planId: string;
      moneyMovements: YnabMoneyMovement[];
      syncedAt: string;
    }): Promise<UpsertResult> {
      const statements = input.moneyMovements.map((movement) =>
        database
          .prepare(
            `INSERT INTO ynab_money_movements (
               plan_id,
               id,
               month,
               moved_at,
               note,
               money_movement_group_id,
               performed_by_user_id,
               from_category_id,
               to_category_id,
               amount_milliunits,
               deleted,
               synced_at,
               updated_at
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(plan_id, id) DO UPDATE SET
               month = excluded.month,
               moved_at = excluded.moved_at,
               note = excluded.note,
               money_movement_group_id = excluded.money_movement_group_id,
               performed_by_user_id = excluded.performed_by_user_id,
               from_category_id = excluded.from_category_id,
               to_category_id = excluded.to_category_id,
               amount_milliunits = excluded.amount_milliunits,
               deleted = excluded.deleted,
               synced_at = excluded.synced_at,
               updated_at = excluded.updated_at`
          )
          .bind(
            input.planId,
            movement.id,
            movement.month ?? null,
            movement.movedAt ?? null,
            movement.note ?? null,
            movement.moneyMovementGroupId ?? null,
            movement.performedByUserId ?? null,
            movement.fromCategoryId ?? null,
            movement.toCategoryId ?? null,
            movement.amount,
            movement.deleted ? 1 : 0,
            input.syncedAt,
            input.syncedAt
          )
      );

      await runBatch(database, statements);

      return { rowsUpserted: input.moneyMovements.length };
    },

    async upsertMoneyMovementGroups(input: {
      planId: string;
      moneyMovementGroups: YnabMoneyMovementGroup[];
      syncedAt: string;
    }): Promise<UpsertResult> {
      const statements = input.moneyMovementGroups.map((group) =>
        database
          .prepare(
            `INSERT INTO ynab_money_movement_groups (
               plan_id,
               id,
               group_created_at,
               month,
               note,
               performed_by_user_id,
               deleted,
               synced_at,
               updated_at
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(plan_id, id) DO UPDATE SET
               group_created_at = excluded.group_created_at,
               month = excluded.month,
               note = excluded.note,
               performed_by_user_id = excluded.performed_by_user_id,
               deleted = excluded.deleted,
               synced_at = excluded.synced_at,
               updated_at = excluded.updated_at`
          )
          .bind(
            input.planId,
            group.id,
            group.groupCreatedAt,
            group.month,
            group.note ?? null,
            group.performedByUserId ?? null,
            group.deleted ? 1 : 0,
            input.syncedAt,
            input.syncedAt
          )
      );

      await runBatch(database, statements);

      return { rowsUpserted: input.moneyMovementGroups.length };
    }
  };
}
