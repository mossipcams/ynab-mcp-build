import type { YnabClient } from "../../platform/ynab/client.js";

export async function listPlans(ynabClient: YnabClient) {
  const result = await ynabClient.listPlans();

  return {
    plans: result.plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      last_modified_on: plan.lastModifiedOn
    })),
    default_plan: result.defaultPlan
      ? {
          id: result.defaultPlan.id,
          name: result.defaultPlan.name
        }
      : null
  };
}

export async function getPlan(ynabClient: YnabClient, planId: string) {
  const plan = await ynabClient.getPlan(planId);

  return {
    plan: {
      id: plan.id,
      name: plan.name,
      last_modified_on: plan.lastModifiedOn,
      first_month: plan.firstMonth,
      last_month: plan.lastMonth,
      account_count: plan.accountCount,
      category_group_count: plan.categoryGroupCount,
      payee_count: plan.payeeCount
    }
  };
}

export async function listCategories(ynabClient: YnabClient, planId: string) {
  const categoryGroups = await ynabClient.listCategories(planId);
  const visibleGroups = categoryGroups
    .filter((group) => !group.deleted && !group.hidden)
    .map((group) => ({
      id: group.id,
      name: group.name,
      categories: group.categories
        .filter((category) => !category.deleted && !category.hidden)
        .map((category) => ({
          id: category.id,
          name: category.name
        }))
    }));

  return {
    category_groups: visibleGroups,
    category_group_count: visibleGroups.length
  };
}

export async function getCategory(ynabClient: YnabClient, planId: string, categoryId: string) {
  const category = await ynabClient.getCategory(planId, categoryId);

  return {
    category: {
      id: category.id,
      name: category.name,
      hidden: category.hidden,
      category_group_name: category.categoryGroupName,
      balance: category.balance,
      goal_type: category.goalType,
      goal_target: category.goalTarget
    }
  };
}

export async function getMonthCategory(
  ynabClient: YnabClient,
  planId: string,
  month: string,
  categoryId: string
) {
  const category = await ynabClient.getMonthCategory(planId, month, categoryId);

  return {
    category: {
      id: category.id,
      name: category.name,
      hidden: category.hidden,
      category_group_name: category.categoryGroupName,
      budgeted: category.budgeted,
      activity: category.activity,
      balance: category.balance,
      goal_type: category.goalType,
      goal_target: category.goalTarget,
      goal_under_funded: category.goalUnderFunded
    }
  };
}

export async function getPlanSettings(ynabClient: YnabClient, planId: string) {
  const settings = await ynabClient.getPlanSettings(planId);

  return {
    settings: {
      date_format: settings.dateFormat
        ? {
            format: settings.dateFormat.format
          }
        : undefined,
      currency_format: settings.currencyFormat
        ? {
            iso_code: settings.currencyFormat.isoCode,
            example_format: settings.currencyFormat.exampleFormat,
            decimal_digits: settings.currencyFormat.decimalDigits,
            decimal_separator: settings.currencyFormat.decimalSeparator,
            symbol_first: settings.currencyFormat.symbolFirst,
            group_separator: settings.currencyFormat.groupSeparator,
            currency_symbol: settings.currencyFormat.currencySymbol,
            display_symbol: settings.currencyFormat.displaySymbol
          }
        : undefined
    }
  };
}

export async function listPlanMonths(ynabClient: YnabClient, planId: string) {
  const months = await ynabClient.listPlanMonths(planId);
  const visibleMonths = months
    .filter((month) => !month.deleted)
    .map((month) => ({
      month: month.month,
      income: month.income,
      budgeted: month.budgeted,
      activity: month.activity,
      to_be_budgeted: month.toBeBudgeted
    }));

  return {
    months: visibleMonths,
    month_count: visibleMonths.length
  };
}

export async function getPlanMonth(ynabClient: YnabClient, planId: string, month: string) {
  const monthDetail = await ynabClient.getPlanMonth(planId, month);

  return {
    month: {
      month: monthDetail.month,
      income: monthDetail.income,
      budgeted: monthDetail.budgeted,
      activity: monthDetail.activity,
      to_be_budgeted: monthDetail.toBeBudgeted,
      age_of_money: monthDetail.ageOfMoney,
      category_count: monthDetail.categoryCount
    }
  };
}
