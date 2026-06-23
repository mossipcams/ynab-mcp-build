import { getKnownDefaultPlan, resolvePlanId } from "../../shared/plans.js";
import { formatAmountMilliunits } from "../../shared/collections.js";
import type { YnabClient } from "../../platform/ynab/client.js";

export async function listPlans(ynabClient: YnabClient) {
  const result = await ynabClient.listPlans();
  const defaultPlan = getKnownDefaultPlan(result);

  return {
    plans: result.plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      last_modified_on: plan.lastModifiedOn,
    })),
    default_plan: defaultPlan
      ? {
          id: defaultPlan.id,
          name: defaultPlan.name,
        }
      : null,
  };
}

export async function listCategories(
  ynabClient: YnabClient,
  planId: string | undefined,
) {
  const resolvedPlanId = await resolvePlanId(ynabClient, planId);
  const categoryGroups = await ynabClient.listCategories(resolvedPlanId);
  const visibleGroups = categoryGroups
    .filter((group) => !group.deleted && !group.hidden)
    .map((group) => ({
      id: group.id,
      name: group.name,
      categories: group.categories
        .filter((category) => !category.deleted && !category.hidden)
        .map((category) => ({
          id: category.id,
          name: category.name,
        })),
    }));

  return {
    category_groups: visibleGroups,
    category_group_count: visibleGroups.length,
  };
}

function formatMoney(value: number | null | undefined) {
  return value == null ? value : formatAmountMilliunits(value);
}

export async function getCategory(
  ynabClient: YnabClient,
  planId: string | undefined,
  categoryId: string,
  month?: string,
) {
  if (month) {
    return getMonthCategory(ynabClient, planId, month, categoryId);
  }

  const resolvedPlanId = await resolvePlanId(ynabClient, planId);
  const category = await ynabClient.getCategory(resolvedPlanId, categoryId);

  return {
    category: {
      id: category.id,
      name: category.name,
      hidden: category.hidden,
      category_group_name: category.categoryGroupName,
      balance: formatMoney(category.balance),
      balance_milliunits: category.balance,
      goal_type: category.goalType,
      goal_target: formatMoney(category.goalTarget),
      goal_target_milliunits: category.goalTarget,
    },
  };
}

export async function getMonthCategory(
  ynabClient: YnabClient,
  planId: string | undefined,
  month: string,
  categoryId: string,
) {
  const resolvedPlanId = await resolvePlanId(ynabClient, planId);
  const category = await ynabClient.getMonthCategory(
    resolvedPlanId,
    month,
    categoryId,
  );

  return {
    category: {
      id: category.id,
      name: category.name,
      hidden: category.hidden,
      category_group_name: category.categoryGroupName,
      budgeted: formatMoney(category.budgeted),
      budgeted_milliunits: category.budgeted,
      activity: formatMoney(category.activity),
      activity_milliunits: category.activity,
      balance: formatMoney(category.balance),
      balance_milliunits: category.balance,
      goal_type: category.goalType,
      goal_target: formatMoney(category.goalTarget),
      goal_target_milliunits: category.goalTarget,
      goal_under_funded: formatMoney(category.goalUnderFunded),
      goal_under_funded_milliunits: category.goalUnderFunded,
    },
  };
}

export async function listPlanMonths(
  ynabClient: YnabClient,
  planId: string | undefined,
) {
  const resolvedPlanId = await resolvePlanId(ynabClient, planId);
  const months = await ynabClient.listPlanMonths(resolvedPlanId);
  const visibleMonths = months
    .filter((month) => !month.deleted)
    .map((month) => ({
      month: month.month,
      income: formatMoney(month.income),
      income_milliunits: month.income,
      budgeted: formatMoney(month.budgeted),
      budgeted_milliunits: month.budgeted,
      activity: formatMoney(month.activity),
      activity_milliunits: month.activity,
      to_be_budgeted: formatMoney(month.toBeBudgeted),
      to_be_budgeted_milliunits: month.toBeBudgeted,
    }));

  return {
    months: visibleMonths,
    month_count: visibleMonths.length,
  };
}

export async function getPlanMonth(
  ynabClient: YnabClient,
  planId: string | undefined,
  month: string,
) {
  const resolvedPlanId = await resolvePlanId(ynabClient, planId);
  const monthDetail = await ynabClient.getPlanMonth(resolvedPlanId, month);

  return {
    month: {
      month: monthDetail.month,
      income: formatMoney(monthDetail.income),
      income_milliunits: monthDetail.income,
      budgeted: formatMoney(monthDetail.budgeted),
      budgeted_milliunits: monthDetail.budgeted,
      activity: formatMoney(monthDetail.activity),
      activity_milliunits: monthDetail.activity,
      to_be_budgeted: formatMoney(monthDetail.toBeBudgeted),
      to_be_budgeted_milliunits: monthDetail.toBeBudgeted,
      age_of_money: monthDetail.ageOfMoney,
      category_count: monthDetail.categoryCount,
    },
  };
}
