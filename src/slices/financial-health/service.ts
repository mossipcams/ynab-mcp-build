import type {
  YnabAccountSummary,
  YnabClient,
  YnabPlanMonthDetail,
  YnabTransaction,
} from "../../platform/ynab/client.js";
import { compactObject } from "../../shared/object.js";
import { resolvePlanId } from "../../shared/plans.js";
import {
  buildAccountSnapshotSummary,
  buildAssignedSpentSummary,
  buildVisibleCategoryHealthSummary,
  formatMilliunits,
  toSpentMilliunits,
} from "./helpers.js";

export type FinancialHealthInput = {
  planId?: string;
  month?: string;
  topN?: number;
  detailLevel?: DetailLevel;
};

export type FinancialHealthRangeInput = {
  planId?: string;
  fromMonth?: string;
  toMonth?: string;
  topN?: number;
  detailLevel?: DetailLevel;
};

export type SpendingAnomaliesInput = {
  planId?: string;
  latestMonth: string;
  baselineMonths?: number;
  topN?: number;
  thresholdMultiplier?: number;
  minimumDifference?: number;
  detailLevel?: DetailLevel;
};

export type CategoryTrendSummaryInput = {
  planId?: string;
  fromMonth?: string;
  toMonth?: string;
  categoryId?: string;
  categoryGroupName?: string;
};

type DisplayRollup = {
  id?: string;
  name: string;
  amount: string;
  transaction_count?: number;
};

type FinancialHealthCategory = NonNullable<
  YnabPlanMonthDetail["categories"]
>[number];

type RangeMonthSummary = {
  month: string;
  income: number;
  budgeted: number;
  activity: number;
  toBeBudgeted: number;
};

type DetailLevel = "brief" | "normal" | "detailed";

function resolveTopN(input: { topN?: number; detailLevel?: DetailLevel }) {
  if (input.topN !== undefined) {
    return input.topN;
  }

  const detailLevel = input.detailLevel ?? "normal";

  switch (detailLevel) {
    case "brief":
      return 3;
    case "detailed":
      return 10;
    case "normal":
      return 5;
  }
}

function isExplicitMonth(month: string | undefined): month is string {
  return Boolean(month && month !== "current");
}

function addMonths(month: string, offset: number) {
  const [yearPart, monthPart] = month.slice(0, 7).split("-");
  const date = new Date(
    Date.UTC(Number(yearPart), Number(monthPart) - 1 + offset, 1),
  );

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function endOfMonth(month: string) {
  const nextMonth = addMonths(month, 1);
  const [yearPart, monthPart] = nextMonth.slice(0, 7).split("-");
  const date = new Date(Date.UTC(Number(yearPart), Number(monthPart) - 1, 0));

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function listMonthsInRange(fromMonth: string, toMonth: string) {
  const months: string[] = [];
  let currentMonth = fromMonth;

  while (currentMonth <= toMonth) {
    months.push(currentMonth);
    currentMonth = addMonths(currentMonth, 1);
  }

  return months;
}

function previousMonths(latestMonth: string, count: number) {
  return Array.from({ length: count }, (_, index) =>
    addMonths(latestMonth, -(count - index)),
  );
}

function toSpentFromActivity(activity: number | undefined) {
  return toSpentMilliunits(activity ?? 0);
}

function toOptionalMilliunits(value: number | undefined) {
  return value ?? 0;
}

function formatOptionalMilliunits(value: number | undefined) {
  return formatMilliunits(toOptionalMilliunits(value));
}

function toMonthKey(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function toNextDateFromMonth(asOfMonth: string) {
  return `${asOfMonth.slice(0, 7)}-01`;
}

function daysUntil(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T00:00:00.000Z`);
  const to = new Date(`${toDate}T00:00:00.000Z`);

  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function sortRollupsByAmount<
  T extends { amountMilliunits: number; name: string },
>(entries: T[]) {
  return entries
    .slice()
    .sort(
      (left, right) =>
        right.amountMilliunits - left.amountMilliunits ||
        left.name.localeCompare(right.name),
    );
}

async function resolveMonth(
  ynabClient: YnabClient,
  planId: string,
  month?: string,
) {
  if (isExplicitMonth(month)) {
    return month;
  }

  const months = await ynabClient.listPlanMonths(planId);
  const resolvedMonth =
    months.find((entry) => !entry.deleted)?.month ?? months[0]?.month;

  if (!resolvedMonth) {
    throw new Error("No YNAB plan month is available.");
  }

  return resolvedMonth;
}

async function resolveMonthRange(
  ynabClient: YnabClient,
  planId: string,
  fromMonth?: string,
  toMonth?: string,
) {
  const resolvedFromMonth = await resolveMonth(ynabClient, planId, fromMonth);
  const resolvedToMonth = toMonth
    ? await resolveMonth(ynabClient, planId, toMonth)
    : resolvedFromMonth;

  if (resolvedFromMonth > resolvedToMonth) {
    throw new Error("fromMonth must be before or equal to toMonth.");
  }

  return {
    fromMonth: resolvedFromMonth,
    toMonth: resolvedToMonth,
  };
}

async function getMonthDetailContext(
  ynabClient: YnabClient,
  input: FinancialHealthInput,
) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const month = await resolveMonth(ynabClient, planId, input.month);
  const monthDetail = await ynabClient.getPlanMonth(planId, month);

  return { planId, month, monthDetail };
}

async function getMonthAccountContext(
  ynabClient: YnabClient,
  input: FinancialHealthInput,
) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const month = await resolveMonth(ynabClient, planId, input.month);
  const [monthDetail, accounts] = await Promise.all([
    ynabClient.getPlanMonth(planId, month),
    ynabClient.listAccounts(planId),
  ]);

  return { planId, month, monthDetail, accounts };
}

async function getMonthTransactionContext(
  ynabClient: YnabClient,
  input: FinancialHealthInput,
) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const month = await resolveMonth(ynabClient, planId, input.month);
  const [monthDetail, transactions] = await Promise.all([
    ynabClient.getPlanMonth(planId, month),
    ynabClient.listTransactions(planId, month, endOfMonth(month)),
  ]);

  return { planId, month, monthDetail, transactions };
}

async function getMonthContext(
  ynabClient: YnabClient,
  input: FinancialHealthInput,
) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const month = await resolveMonth(ynabClient, planId, input.month);
  const [monthDetail, accounts, transactions] = await Promise.all([
    ynabClient.getPlanMonth(planId, month),
    ynabClient.listAccounts(planId),
    ynabClient.listTransactions(planId, month, endOfMonth(month)),
  ]);

  return { planId, month, monthDetail, accounts, transactions };
}

async function getRangeContext(
  ynabClient: YnabClient,
  input: FinancialHealthRangeInput,
) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const { fromMonth, toMonth } = await resolveMonthRange(
    ynabClient,
    planId,
    input.fromMonth,
    input.toMonth,
  );
  const [months, transactions] = await Promise.all([
    ynabClient.listPlanMonths(planId),
    ynabClient.listTransactions(planId, fromMonth, endOfMonth(toMonth)),
  ]);
  const visibleMonths = months
    .filter(
      (month) =>
        !month.deleted && month.month >= fromMonth && month.month <= toMonth,
    )
    .sort((left, right) => left.month.localeCompare(right.month))
    .map((month) => ({
      month: month.month,
      income: month.income ?? 0,
      budgeted: month.budgeted ?? 0,
      activity: month.activity ?? 0,
      toBeBudgeted: month.toBeBudgeted ?? 0,
    })) satisfies RangeMonthSummary[];

  return { planId, fromMonth, toMonth, months: visibleMonths, transactions };
}

function toTopRollups(
  entries: Array<{ id?: string; name: string; amountMilliunits: number }>,
  topN: number,
): DisplayRollup[] {
  return entries
    .slice()
    .sort(
      (left, right) =>
        right.amountMilliunits - left.amountMilliunits ||
        left.name.localeCompare(right.name),
    )
    .slice(0, topN)
    .map(
      (entry) =>
        compactObject({
          id: entry.id,
          name: entry.name,
          amount: formatMilliunits(entry.amountMilliunits),
        }) as DisplayRollup,
    );
}

function summarizeBudgetHealthMonth(
  monthDetail: YnabPlanMonthDetail,
  topN: number,
) {
  const categories = monthDetail.categories ?? [];
  const summary = buildVisibleCategoryHealthSummary(categories);
  const overspentCategories = summary.overspentCategories
    .map((category) => ({
      id: category.id,
      name: category.name,
      categoryGroupName: category.categoryGroupName,
      amountMilliunits: Math.abs(category.balance),
    }))
    .sort(
      (left, right) =>
        right.amountMilliunits - left.amountMilliunits ||
        left.name.localeCompare(right.name),
    );
  const underfundedCategories = summary.underfundedCategories
    .map((category) => ({
      id: category.id,
      name: category.name,
      categoryGroupName: category.categoryGroupName,
      amountMilliunits: category.goalUnderFunded ?? 0,
    }))
    .sort(
      (left, right) =>
        right.amountMilliunits - left.amountMilliunits ||
        left.name.localeCompare(right.name),
    );

  return {
    month: monthDetail.month,
    age_of_money: monthDetail.ageOfMoney,
    ready_to_assign: formatMilliunits(monthDetail.toBeBudgeted ?? 0),
    available_total: formatMilliunits(summary.availableTotalMilliunits),
    overspent_total: formatMilliunits(
      overspentCategories.reduce(
        (sum, category) => sum + category.amountMilliunits,
        0,
      ),
    ),
    underfunded_total: formatMilliunits(
      underfundedCategories.reduce(
        (sum, category) => sum + category.amountMilliunits,
        0,
      ),
    ),
    ...buildAssignedSpentSummary(
      monthDetail.budgeted ?? 0,
      toSpentMilliunits(monthDetail.activity ?? 0),
    ),
    overspent_category_count: overspentCategories.length,
    underfunded_category_count: underfundedCategories.length,
    top_overspent_categories: overspentCategories
      .slice(0, topN)
      .map((category) =>
        compactObject({
          id: category.id,
          name: category.name,
          category_group_name: category.categoryGroupName,
          amount: formatMilliunits(category.amountMilliunits),
        }),
      ),
    top_underfunded_categories: underfundedCategories
      .slice(0, topN)
      .map((category) =>
        compactObject({
          id: category.id,
          name: category.name,
          category_group_name: category.categoryGroupName,
          amount: formatMilliunits(category.amountMilliunits),
        }),
      ),
  };
}

function isNonTransferMonthTransaction(
  transaction: YnabTransaction,
  month: string,
) {
  return (
    !transaction.deleted &&
    !transaction.transferAccountId &&
    transaction.date.startsWith(month.slice(0, 7))
  );
}

function isNonTransferRangeTransaction(
  transaction: YnabTransaction,
  fromMonth: string,
  toMonth: string,
) {
  const monthKey = `${transaction.date.slice(0, 7)}-01`;
  return (
    !transaction.deleted &&
    !transaction.transferAccountId &&
    monthKey >= fromMonth &&
    monthKey <= toMonth
  );
}

function isNonTransferScheduledTransaction(transaction: {
  deleted?: boolean;
  transferAccountId?: string | null;
  dateNext?: string | null;
}) {
  return (
    !transaction.deleted &&
    !transaction.transferAccountId &&
    Boolean(transaction.dateNext)
  );
}

function buildCleanupCounts(transactions: YnabTransaction[]) {
  const visibleTransactions = transactions.filter(
    (transaction) => !transaction.deleted,
  );

  return {
    uncategorizedTransactionCount: visibleTransactions.filter(
      (transaction) => !transaction.categoryId,
    ).length,
    unapprovedTransactionCount: visibleTransactions.filter(
      (transaction) => !transaction.approved,
    ).length,
    unclearedTransactionCount: visibleTransactions.filter(
      (transaction) => transaction.cleared === "uncleared",
    ).length,
  };
}

function buildHealthRisks(input: {
  overspentCategoryCount: number;
  underfundedCategoryCount: number;
  cleanupCount: number;
  readyToAssign: number;
}) {
  const risks: Array<{
    code: string;
    severity: "high" | "medium";
    penalty: number;
  }> = [];

  if (input.readyToAssign < 0) {
    risks.push({
      code: "negative_ready_to_assign",
      severity: "high",
      penalty: 20,
    });
  }
  if (input.overspentCategoryCount > 0) {
    risks.push({ code: "overspent_categories", severity: "high", penalty: 15 });
  }
  if (input.underfundedCategoryCount > 0) {
    risks.push({ code: "goal_underfunding", severity: "medium", penalty: 10 });
  }
  if (input.cleanupCount > 0) {
    risks.push({ code: "cleanup_backlog", severity: "medium", penalty: 5 });
  }

  return risks;
}

function buildSpendingAnomalies(
  latestCategories: FinancialHealthCategory[],
  baselineMonthDetails: YnabPlanMonthDetail[],
  options: {
    minimumDifference: number;
    thresholdMultiplier: number;
    topN: number;
  },
) {
  const baselineSpentLookups = baselineMonthDetails.map(
    (monthDetail) =>
      new Map(
        (monthDetail.categories ?? [])
          .filter((category) => !category.deleted && !category.hidden)
          .map(
            (category) =>
              [category.id, toSpentFromActivity(category.activity)] as const,
          ),
      ),
  );

  return latestCategories
    .filter((category) => !category.deleted && !category.hidden)
    .map((category) => {
      const latestSpent = toSpentFromActivity(category.activity);
      const baselineValues = baselineSpentLookups.map(
        (lookup) => lookup.get(category.id) ?? 0,
      );
      const baselineAverage = baselineValues.length
        ? baselineValues.reduce((sum, value) => sum + value, 0) /
          baselineValues.length
        : 0;
      const increase = latestSpent - baselineAverage;
      const increasePercent =
        baselineAverage > 0 ? (increase / baselineAverage) * 100 : undefined;

      return {
        category_id: category.id,
        category_name: category.name,
        latestSpent,
        baselineAverage,
        increase,
        increasePercent,
      };
    })
    .filter((entry) => entry.increase >= options.minimumDifference)
    .filter((entry) =>
      entry.baselineAverage > 0
        ? entry.latestSpent >=
          entry.baselineAverage * options.thresholdMultiplier
        : entry.latestSpent > 0,
    )
    .sort(
      (left, right) =>
        right.increase - left.increase ||
        left.category_name.localeCompare(right.category_name),
    )
    .slice(0, options.topN)
    .map((entry) =>
      compactObject({
        category_id: entry.category_id,
        category_name: entry.category_name,
        latest_spent: formatMilliunits(entry.latestSpent),
        baseline_average: formatMilliunits(Math.round(entry.baselineAverage)),
        increase: formatMilliunits(Math.round(entry.increase)),
        increase_pct: entry.increasePercent?.toFixed(2),
      }),
    );
}

function toMonthSpendingRollups(transactions: YnabTransaction[], topN: number) {
  const rollups = new Map<
    string,
    {
      id?: string;
      name: string;
      amountMilliunits: number;
      transactionCount: number;
    }
  >();

  for (const transaction of transactions.filter((entry) => entry.amount < 0)) {
    const key = transaction.categoryId ?? "uncategorized";
    const current = rollups.get(key);

    if (current) {
      current.amountMilliunits += Math.abs(transaction.amount);
      current.transactionCount += 1;
      continue;
    }

    rollups.set(key, {
      ...(transaction.categoryId ? { id: transaction.categoryId } : {}),
      name: transaction.categoryName ?? "Uncategorized",
      amountMilliunits: Math.abs(transaction.amount),
      transactionCount: 1,
    });
  }

  return Array.from(rollups.values())
    .sort(
      (left, right) =>
        right.amountMilliunits - left.amountMilliunits ||
        left.name.localeCompare(right.name),
    )
    .slice(0, topN)
    .map((entry) =>
      compactObject({
        id: entry.id,
        name: entry.name,
        amount: formatMilliunits(entry.amountMilliunits),
        transaction_count: entry.transactionCount,
      }),
    );
}

function toExampleTransactions(transactions: YnabTransaction[], topN: number) {
  return transactions
    .slice()
    .sort(
      (left, right) =>
        Math.abs(right.amount) - Math.abs(left.amount) ||
        right.date.localeCompare(left.date),
    )
    .slice(0, topN)
    .map((transaction) =>
      compactObject({
        id: transaction.id,
        date: transaction.date,
        amount: formatMilliunits(Math.abs(transaction.amount)),
        payee_name: transaction.payeeName,
        category_name: transaction.categoryName,
        account_name: transaction.accountName,
        type: transaction.amount >= 0 ? "inflow" : "outflow",
      }),
    );
}

export async function getFinancialSnapshot(
  ynabClient: YnabClient,
  input: FinancialHealthInput,
) {
  const topN = resolveTopN(input);
  const { monthDetail, accounts } = await getMonthAccountContext(
    ynabClient,
    input,
  );
  const snapshot = buildAccountSnapshotSummary(
    accounts as YnabAccountSummary[],
  );

  return {
    month: monthDetail.month,
    net_worth: formatMilliunits(snapshot.netWorthMilliunits),
    liquid_cash: formatMilliunits(snapshot.liquidCashMilliunits),
    debt: formatMilliunits(
      snapshot.negativeAccounts.reduce(
        (sum, account) => sum + Math.abs(account.balance),
        0,
      ),
    ),
    ready_to_assign: formatOptionalMilliunits(monthDetail.toBeBudgeted),
    income: formatOptionalMilliunits(monthDetail.income),
    ...buildAssignedSpentSummary(
      toOptionalMilliunits(monthDetail.budgeted),
      toSpentFromActivity(monthDetail.activity),
    ),
    age_of_money: monthDetail.ageOfMoney,
    account_count: snapshot.activeAccounts.length,
    on_budget_account_count: snapshot.onBudgetAccountCount,
    debt_account_count: snapshot.negativeAccounts.length,
    top_asset_accounts: toTopRollups(
      snapshot.positiveAccounts.map((account) => ({
        id: account.id,
        name: account.name,
        amountMilliunits: account.balance,
      })),
      topN,
    ),
    top_debt_accounts: toTopRollups(
      snapshot.negativeAccounts.map((account) => ({
        id: account.id,
        name: account.name,
        amountMilliunits: Math.abs(account.balance),
      })),
      topN,
    ),
  };
}

export async function getBudgetHealthSummary(
  ynabClient: YnabClient,
  input: FinancialHealthInput,
) {
  const topN = resolveTopN(input);
  const { monthDetail } = await getMonthDetailContext(ynabClient, input);

  return summarizeBudgetHealthMonth(monthDetail, topN);
}

export async function getFinancialHealthCheck(
  ynabClient: YnabClient,
  input: FinancialHealthInput,
) {
  const topN = resolveTopN(input);
  const { monthDetail, accounts, transactions } = await getMonthContext(
    ynabClient,
    input,
  );
  const budgetHealth = summarizeBudgetHealthMonth(monthDetail, topN);
  const snapshot = buildAccountSnapshotSummary(
    accounts as YnabAccountSummary[],
  );
  const monthTransactions = transactions.filter((transaction) =>
    isNonTransferMonthTransaction(transaction, monthDetail.month),
  );
  const cleanup = buildCleanupCounts(monthTransactions);
  const risks = buildHealthRisks({
    overspentCategoryCount: budgetHealth.overspent_category_count,
    underfundedCategoryCount: budgetHealth.underfunded_category_count,
    cleanupCount:
      cleanup.uncategorizedTransactionCount +
      cleanup.unapprovedTransactionCount +
      cleanup.unclearedTransactionCount,
    readyToAssign: monthDetail.toBeBudgeted ?? 0,
  });
  const score = Math.max(
    0,
    100 - risks.reduce((sum, entry) => sum + entry.penalty, 0),
  );

  return {
    as_of_month: monthDetail.month,
    status: score >= 80 ? "healthy" : score >= 50 ? "watch" : "needs_attention",
    score,
    metrics: {
      net_worth: formatMilliunits(snapshot.netWorthMilliunits),
      liquid_cash: formatMilliunits(snapshot.liquidCashMilliunits),
      debt: formatMilliunits(
        snapshot.negativeAccounts.reduce(
          (sum, account) => sum + Math.abs(account.balance),
          0,
        ),
      ),
      ready_to_assign: formatOptionalMilliunits(monthDetail.toBeBudgeted),
      age_of_money: monthDetail.ageOfMoney,
      overspent_category_count: budgetHealth.overspent_category_count,
      underfunded_category_count: budgetHealth.underfunded_category_count,
      uncategorized_transaction_count: cleanup.uncategorizedTransactionCount,
      unapproved_transaction_count: cleanup.unapprovedTransactionCount,
      uncleared_transaction_count: cleanup.unclearedTransactionCount,
    },
    top_risks: risks
      .slice(0, topN)
      .map((entry) =>
        compactObject({ code: entry.code, severity: entry.severity }),
      ),
  };
}

export async function getMonthlyReview(
  ynabClient: YnabClient,
  input: FinancialHealthInput,
) {
  const topN = resolveTopN(input);
  const { monthDetail, transactions } = await getMonthTransactionContext(
    ynabClient,
    input,
  );
  const budgetHealth = summarizeBudgetHealthMonth(monthDetail, topN);
  const monthTransactions = transactions.filter((transaction) =>
    isNonTransferMonthTransaction(transaction, monthDetail.month),
  );
  const inflowMilliunits = monthTransactions
    .filter((transaction) => transaction.amount > 0)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const outflowMilliunits = monthTransactions
    .filter((transaction) => transaction.amount < 0)
    .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);

  return {
    month: monthDetail.month,
    income: formatMilliunits(monthDetail.income ?? 0),
    inflow: formatMilliunits(inflowMilliunits),
    outflow: formatMilliunits(outflowMilliunits),
    net_flow: formatMilliunits(inflowMilliunits - outflowMilliunits),
    ready_to_assign: budgetHealth.ready_to_assign,
    available_total: budgetHealth.available_total,
    overspent_total: budgetHealth.overspent_total,
    underfunded_total: budgetHealth.underfunded_total,
    assigned: budgetHealth.assigned,
    spent: budgetHealth.spent,
    assigned_vs_spent: budgetHealth.assigned_vs_spent,
    top_spending_categories: toMonthSpendingRollups(monthTransactions, topN),
    ...(input.detailLevel
      ? {
          example_transactions: toExampleTransactions(
            monthTransactions.filter((transaction) => transaction.amount < 0),
            topN,
          ),
        }
      : {}),
  };
}

export async function getCashFlowSummary(
  ynabClient: YnabClient,
  input: FinancialHealthRangeInput,
) {
  const { fromMonth, toMonth, months, transactions } = await getRangeContext(
    ynabClient,
    input,
  );
  const periodFlow = new Map<string, { inflow: number; outflow: number }>(
    months.map((month) => [month.month, { inflow: 0, outflow: 0 }]),
  );

  for (const transaction of transactions) {
    if (!isNonTransferRangeTransaction(transaction, fromMonth, toMonth)) {
      continue;
    }

    const monthKey = `${transaction.date.slice(0, 7)}-01`;
    const flow = periodFlow.get(monthKey) ?? { inflow: 0, outflow: 0 };

    if (transaction.amount >= 0) {
      flow.inflow += transaction.amount;
    } else {
      flow.outflow += Math.abs(transaction.amount);
    }

    periodFlow.set(monthKey, flow);
  }

  const inflowMilliunits = Array.from(periodFlow.values()).reduce(
    (sum, period) => sum + period.inflow,
    0,
  );
  const outflowMilliunits = Array.from(periodFlow.values()).reduce(
    (sum, period) => sum + period.outflow,
    0,
  );
  const assignedMilliunits = months.reduce(
    (sum, month) => sum + month.budgeted,
    0,
  );
  const spentMilliunits = months.reduce(
    (sum, month) => sum + toSpentFromActivity(month.activity),
    0,
  );

  return {
    from_month: fromMonth,
    to_month: toMonth,
    inflow: formatMilliunits(inflowMilliunits),
    outflow: formatMilliunits(outflowMilliunits),
    net_flow: formatMilliunits(inflowMilliunits - outflowMilliunits),
    ...buildAssignedSpentSummary(assignedMilliunits, spentMilliunits),
    periods: months.map((month) => {
      const flow = periodFlow.get(month.month) ?? { inflow: 0, outflow: 0 };

      return {
        month: month.month,
        inflow: formatMilliunits(flow.inflow),
        outflow: formatMilliunits(flow.outflow),
        net_flow: formatMilliunits(flow.inflow - flow.outflow),
        ...buildAssignedSpentSummary(
          month.budgeted,
          toSpentFromActivity(month.activity),
        ),
      };
    }),
  };
}

export async function getSpendingSummary(
  ynabClient: YnabClient,
  input: FinancialHealthRangeInput,
) {
  const topN = resolveTopN(input);
  const { planId, fromMonth, toMonth, months, transactions } =
    await getRangeContext(ynabClient, input);
  const categoryGroups = await ynabClient.listCategories(planId);
  const categoryGroupLookup = new Map(
    categoryGroups.flatMap((group) =>
      group.categories
        .filter((category) => !category.deleted)
        .map((category) => [category.id, group.name] as const),
    ),
  );
  const categoryRollups = new Map<
    string,
    {
      id?: string;
      name: string;
      amountMilliunits: number;
      transactionCount: number;
    }
  >();
  const categoryGroupRollups = new Map<
    string,
    { name: string; amountMilliunits: number; transactionCount: number }
  >();
  const payeeRollups = new Map<
    string,
    {
      id?: string;
      name: string;
      amountMilliunits: number;
      transactionCount: number;
    }
  >();

  const spendingTransactions = transactions.filter(
    (transaction) =>
      isNonTransferRangeTransaction(transaction, fromMonth, toMonth) &&
      transaction.amount < 0,
  );

  for (const transaction of spendingTransactions) {
    const spendMilliunits = Math.abs(transaction.amount);
    const categoryId = transaction.categoryId ?? "uncategorized";
    const categoryName = transaction.categoryName ?? "Uncategorized";
    const groupName = categoryGroupLookup.get(categoryId) ?? "Uncategorized";
    const payeeId = transaction.payeeId ?? "unknown-payee";
    const payeeName = transaction.payeeName ?? "Unknown Payee";

    const categoryRollup = categoryRollups.get(categoryId);
    if (categoryRollup) {
      categoryRollup.amountMilliunits += spendMilliunits;
      categoryRollup.transactionCount += 1;
    } else {
      categoryRollups.set(categoryId, {
        ...(transaction.categoryId ? { id: transaction.categoryId } : {}),
        name: categoryName,
        amountMilliunits: spendMilliunits,
        transactionCount: 1,
      });
    }

    const groupRollup = categoryGroupRollups.get(groupName);
    if (groupRollup) {
      groupRollup.amountMilliunits += spendMilliunits;
      groupRollup.transactionCount += 1;
    } else {
      categoryGroupRollups.set(groupName, {
        name: groupName,
        amountMilliunits: spendMilliunits,
        transactionCount: 1,
      });
    }

    const payeeRollup = payeeRollups.get(payeeId);
    if (payeeRollup) {
      payeeRollup.amountMilliunits += spendMilliunits;
      payeeRollup.transactionCount += 1;
    } else {
      payeeRollups.set(payeeId, {
        ...(transaction.payeeId ? { id: transaction.payeeId } : {}),
        name: payeeName,
        amountMilliunits: spendMilliunits,
        transactionCount: 1,
      });
    }
  }

  const assignedMilliunits = months.reduce(
    (sum, month) => sum + month.budgeted,
    0,
  );
  const spentMilliunits = spendingTransactions.reduce(
    (sum, transaction) => sum + Math.abs(transaction.amount),
    0,
  );

  return {
    from_month: fromMonth,
    to_month: toMonth,
    ...buildAssignedSpentSummary(assignedMilliunits, spentMilliunits),
    transaction_count: spendingTransactions.length,
    average_transaction: formatMilliunits(
      spendingTransactions.length
        ? Math.round(spentMilliunits / spendingTransactions.length)
        : 0,
    ),
    top_categories: Array.from(categoryRollups.values())
      .sort(
        (left, right) =>
          right.amountMilliunits - left.amountMilliunits ||
          left.name.localeCompare(right.name),
      )
      .slice(0, topN)
      .map((entry) =>
        compactObject({
          id: entry.id,
          name: entry.name,
          amount: formatMilliunits(entry.amountMilliunits),
          transaction_count: entry.transactionCount,
        }),
      ),
    top_category_groups: Array.from(categoryGroupRollups.values())
      .sort(
        (left, right) =>
          right.amountMilliunits - left.amountMilliunits ||
          left.name.localeCompare(right.name),
      )
      .slice(0, topN)
      .map((entry) =>
        compactObject({
          name: entry.name,
          amount: formatMilliunits(entry.amountMilliunits),
          transaction_count: entry.transactionCount,
        }),
      ),
    top_payees: Array.from(payeeRollups.values())
      .sort(
        (left, right) =>
          right.amountMilliunits - left.amountMilliunits ||
          left.name.localeCompare(right.name),
      )
      .slice(0, topN)
      .map((entry) =>
        compactObject({
          id: entry.id,
          name: entry.name,
          amount: formatMilliunits(entry.amountMilliunits),
          transaction_count: entry.transactionCount,
        }),
      ),
    ...(input.detailLevel
      ? {
          example_transactions: toExampleTransactions(
            spendingTransactions,
            topN,
          ),
        }
      : {}),
  };
}

export async function getSpendingAnomalies(
  ynabClient: YnabClient,
  input: SpendingAnomaliesInput,
) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const baselineMonths = input.baselineMonths ?? 3;
  const topN = resolveTopN(input);
  const thresholdMultiplier = input.thresholdMultiplier ?? 1.5;
  const minimumDifference = input.minimumDifference ?? 50000;
  const baselineMonthIds = previousMonths(input.latestMonth, baselineMonths);
  const monthDetails = await Promise.all([
    ...baselineMonthIds.map((month) => ynabClient.getPlanMonth(planId, month)),
    ynabClient.getPlanMonth(planId, input.latestMonth),
  ]);
  const latestMonthDetail = monthDetails[monthDetails.length - 1];
  if (!latestMonthDetail) {
    throw new Error(`YNAB month ${input.latestMonth} was not found.`);
  }
  const anomalies = buildSpendingAnomalies(
    latestMonthDetail.categories ?? [],
    monthDetails.slice(0, baselineMonthIds.length),
    {
      minimumDifference,
      thresholdMultiplier,
      topN,
    },
  );

  return {
    latest_month: input.latestMonth,
    baseline_month_count: baselineMonthIds.length,
    anomaly_count: anomalies.length,
    anomalies,
  };
}

export async function getCategoryTrendSummary(
  ynabClient: YnabClient,
  input: CategoryTrendSummaryInput,
) {
  if (!input.categoryId && !input.categoryGroupName) {
    throw new Error("Provide either categoryId or categoryGroupName.");
  }

  const planId = await resolvePlanId(ynabClient, input.planId);
  const { fromMonth, toMonth } = await resolveMonthRange(
    ynabClient,
    planId,
    input.fromMonth,
    input.toMonth,
  );
  const months = listMonthsInRange(fromMonth, toMonth);
  const monthDetails = await Promise.all(
    months.map((month) => ynabClient.getPlanMonth(planId, month)),
  );
  const periods = monthDetails.map((monthDetail) => {
    const matchingCategories = (monthDetail.categories ?? []).filter(
      (category) => {
        if (category.deleted || category.hidden) {
          return false;
        }

        if (input.categoryId) {
          return category.id === input.categoryId;
        }

        return category.categoryGroupName === input.categoryGroupName;
      },
    );
    const assignedMilliunits = matchingCategories.reduce(
      (sum, category) => sum + (category.budgeted ?? 0),
      0,
    );
    const spentMilliunits = matchingCategories.reduce(
      (sum, category) => sum + toSpentFromActivity(category.activity),
      0,
    );
    const availableMilliunits = matchingCategories.reduce(
      (sum, category) => sum + category.balance,
      0,
    );

    return {
      month: monthDetail.month,
      assignedMilliunits,
      spentMilliunits,
      availableMilliunits,
    };
  });
  const totalSpentMilliunits = periods.reduce(
    (sum, period) => sum + period.spentMilliunits,
    0,
  );
  const peakPeriod = periods.reduce(
    (peak, period) =>
      !peak || period.spentMilliunits > peak.spentMilliunits ? period : peak,
    periods[0],
  );

  return {
    from_month: fromMonth,
    to_month: toMonth,
    scope: input.categoryId
      ? { type: "category", id: input.categoryId }
      : {
          type: "category_group",
          name: input.categoryGroupName,
          match_basis: "category_group_name",
        },
    average_spent: formatMilliunits(
      Math.round(totalSpentMilliunits / Math.max(periods.length, 1)),
    ),
    peak_month: peakPeriod?.month,
    spent_change: formatMilliunits(
      (periods[periods.length - 1]?.spentMilliunits ?? 0) -
        (periods[0]?.spentMilliunits ?? 0),
    ),
    periods: periods.map((period) => ({
      month: period.month,
      assigned: formatMilliunits(period.assignedMilliunits),
      spent: formatMilliunits(period.spentMilliunits),
      available: formatMilliunits(period.availableMilliunits),
    })),
  };
}

export async function getCashRunway(
  ynabClient: YnabClient,
  input: { planId?: string; asOfMonth: string; monthsBack?: number },
) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const monthsBack = input.monthsBack ?? 3;
  const [accounts, months, scheduledTransactions] = await Promise.all([
    ynabClient.listAccounts(planId),
    ynabClient.listPlanMonths(planId),
    ynabClient.listScheduledTransactions(planId),
  ]);
  const liquidCash = buildAccountSnapshotSummary(accounts).liquidCashMilliunits;
  const consideredMonths = months
    .filter((month) => !month.deleted && month.month <= input.asOfMonth)
    .sort((left, right) => right.month.localeCompare(left.month))
    .slice(0, monthsBack);
  const averageMonthlySpending = consideredMonths.length
    ? consideredMonths.reduce(
        (sum, month) => sum + toSpentFromActivity(month.activity),
        0,
      ) / consideredMonths.length
    : 0;
  const averageDailyOutflow = averageMonthlySpending / 30;
  const asOfDate = toNextDateFromMonth(input.asOfMonth);
  const scheduledNetNext30d = scheduledTransactions
    .filter(isNonTransferScheduledTransaction)
    .filter((transaction) => {
      const dueInDays = daysUntil(asOfDate, transaction.dateNext!);
      return dueInDays >= 0 && dueInDays <= 30;
    })
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const runwayDays =
    averageDailyOutflow === 0 ? undefined : liquidCash / averageDailyOutflow;
  const status =
    runwayDays == null
      ? "no_outflows"
      : runwayDays >= 90
        ? "stable"
        : runwayDays >= 30
          ? "watch"
          : "urgent";

  return compactObject({
    as_of_month: input.asOfMonth,
    liquid_cash: formatMilliunits(liquidCash),
    average_daily_outflow: formatMilliunits(Math.round(averageDailyOutflow)),
    scheduled_net_next_30d: formatMilliunits(scheduledNetNext30d),
    runway_days: runwayDays?.toFixed(2),
    status,
    months_considered: consideredMonths.length,
  });
}

export async function getUpcomingObligations(
  ynabClient: YnabClient,
  input: {
    planId?: string;
    asOfDate?: string;
    topN?: number;
    detailLevel?: DetailLevel;
  },
) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const asOfDate = input.asOfDate ?? new Date().toISOString().slice(0, 10);
  const topN = resolveTopN(input);
  const scheduledTransactions = (
    await ynabClient.listScheduledTransactions(planId)
  )
    .filter(isNonTransferScheduledTransaction)
    .map((transaction) => ({
      id: transaction.id,
      date_next: transaction.dateNext!,
      payee_name: transaction.payeeName,
      category_name: transaction.categoryName,
      account_name: transaction.accountName,
      amount: transaction.amount,
      days_until_due: daysUntil(asOfDate, transaction.dateNext!),
    }))
    .filter(
      (transaction) =>
        transaction.days_until_due >= 0 && transaction.days_until_due <= 30,
    )
    .sort(
      (left, right) =>
        left.days_until_due - right.days_until_due ||
        Math.abs(right.amount) - Math.abs(left.amount),
    );

  const windows = Object.fromEntries(
    [7, 14, 30].map((windowDays) => {
      const windowTransactions = scheduledTransactions.filter(
        (transaction) => transaction.days_until_due <= windowDays,
      );
      const totalInflows = windowTransactions
        .filter((transaction) => transaction.amount > 0)
        .reduce((sum, transaction) => sum + transaction.amount, 0);
      const totalOutflows = windowTransactions
        .filter((transaction) => transaction.amount < 0)
        .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);

      return [
        `${windowDays}d`,
        {
          total_inflows: formatMilliunits(totalInflows),
          total_outflows: formatMilliunits(totalOutflows),
          net_upcoming: formatMilliunits(totalInflows - totalOutflows),
          obligation_count: windowTransactions.filter(
            (transaction) => transaction.amount < 0,
          ).length,
          expected_inflow_count: windowTransactions.filter(
            (transaction) => transaction.amount > 0,
          ).length,
        },
      ];
    }),
  );

  return {
    as_of_date: asOfDate,
    obligation_count: scheduledTransactions.filter(
      (transaction) => transaction.amount < 0,
    ).length,
    expected_inflow_count: scheduledTransactions.filter(
      (transaction) => transaction.amount > 0,
    ).length,
    windows,
    top_due: scheduledTransactions.slice(0, topN).map((transaction) =>
      compactObject({
        id: transaction.id,
        date_next: transaction.date_next,
        payee_name: transaction.payee_name,
        category_name: transaction.category_name,
        account_name: transaction.account_name,
        amount: formatMilliunits(Math.abs(transaction.amount)),
        type: transaction.amount >= 0 ? "inflow" : "outflow",
      }),
    ),
  };
}

export async function getIncomeSummary(
  ynabClient: YnabClient,
  input: FinancialHealthRangeInput,
) {
  const topN = resolveTopN(input);
  const { fromMonth, toMonth, transactions } = await getRangeContext(
    ynabClient,
    input,
  );
  const incomeTransactions = transactions.filter(
    (transaction) =>
      isNonTransferRangeTransaction(transaction, fromMonth, toMonth) &&
      transaction.amount > 0,
  );
  const incomeByMonth = new Map(
    listMonthsInRange(fromMonth, toMonth).map((month) => [month, 0]),
  );
  const incomeByPayee = new Map<
    string,
    {
      id?: string;
      name: string;
      amountMilliunits: number;
      transactionCount: number;
    }
  >();

  for (const transaction of incomeTransactions) {
    const month = toMonthKey(transaction.date);
    incomeByMonth.set(
      month,
      (incomeByMonth.get(month) ?? 0) + transaction.amount,
    );

    const payeeKey = transaction.payeeId ?? "unknown-payee";
    const current = incomeByPayee.get(payeeKey);
    if (current) {
      current.amountMilliunits += transaction.amount;
      current.transactionCount += 1;
    } else {
      incomeByPayee.set(payeeKey, {
        ...(transaction.payeeId ? { id: transaction.payeeId } : {}),
        name: transaction.payeeName ?? "Unknown Payee",
        amountMilliunits: transaction.amount,
        transactionCount: 1,
      });
    }
  }

  const monthTotals = Array.from(incomeByMonth.entries()).map(
    ([month, income]) => ({ month, income }),
  );
  const incomeValues = monthTotals.map((entry) => entry.income);
  const incomeTotal = incomeValues.reduce((sum, value) => sum + value, 0);
  const averageIncome = incomeValues.length
    ? incomeTotal / incomeValues.length
    : 0;
  const sortedIncome = incomeValues.slice().sort((left, right) => left - right);
  const medianIncome =
    sortedIncome.length === 0
      ? 0
      : sortedIncome.length % 2 === 1
        ? (sortedIncome[(sortedIncome.length - 1) / 2] ?? 0)
        : ((sortedIncome[sortedIncome.length / 2 - 1] ?? 0) +
            (sortedIncome[sortedIncome.length / 2] ?? 0)) /
          2;
  const minIncome = sortedIncome[0] ?? 0;
  const maxIncome = sortedIncome[sortedIncome.length - 1] ?? 0;
  const volatilityPercent =
    averageIncome === 0 ? 0 : ((maxIncome - minIncome) / averageIncome) * 100;

  return {
    from_month: fromMonth,
    to_month: toMonth,
    income_total: formatMilliunits(incomeTotal),
    average_monthly_income: formatMilliunits(Math.round(averageIncome)),
    median_monthly_income: formatMilliunits(Math.round(medianIncome)),
    income_month_count: monthTotals.length,
    volatility_percent: volatilityPercent.toFixed(2),
    top_income_sources: sortRollupsByAmount(Array.from(incomeByPayee.values()))
      .slice(0, topN)
      .map((entry) =>
        compactObject({
          id: entry.id,
          name: entry.name,
          amount: formatMilliunits(entry.amountMilliunits),
          transaction_count: entry.transactionCount,
        }),
      ),
    months: monthTotals.map((entry) => ({
      month: entry.month,
      income: formatMilliunits(entry.income),
    })),
  };
}

function average(values: number[]) {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function detectCadence(dates: string[]) {
  if (dates.length < 3) {
    return undefined;
  }

  const sortedDates = dates
    .slice()
    .sort((left, right) => left.localeCompare(right));
  const intervals = sortedDates
    .slice(1)
    .map((date, index) => daysUntil(sortedDates[index]!, date));
  const averageInterval = average(intervals);

  if (averageInterval >= 25 && averageInterval <= 35) {
    return "monthly";
  }

  return undefined;
}

export async function getRecurringExpenseSummary(
  ynabClient: YnabClient,
  input: { planId?: string; fromDate: string; toDate: string; topN?: number },
) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const topN = resolveTopN(input);
  const transactions = await ynabClient.listTransactions(
    planId,
    input.fromDate,
    input.toDate,
  );
  const candidates = new Map<
    string,
    {
      payeeId?: string | null;
      payeeName: string;
      dates: string[];
      amounts: number[];
    }
  >();

  for (const transaction of transactions) {
    if (
      transaction.deleted ||
      transaction.transferAccountId ||
      transaction.amount >= 0 ||
      transaction.date < input.fromDate ||
      transaction.date > input.toDate
    ) {
      continue;
    }

    const key = transaction.payeeId ?? transaction.payeeName ?? "unknown-payee";
    const current = candidates.get(key) ?? {
      ...(transaction.payeeId !== undefined
        ? { payeeId: transaction.payeeId }
        : {}),
      payeeName: transaction.payeeName ?? "Unknown Payee",
      dates: [] as string[],
      amounts: [] as number[],
    };
    current.dates.push(transaction.date);
    current.amounts.push(Math.abs(transaction.amount));
    candidates.set(key, current);
  }

  const recurringExpenses = Array.from(candidates.values())
    .map((candidate) => {
      const cadence = detectCadence(candidate.dates);
      if (!cadence) {
        return undefined;
      }

      const averageAmount = Math.round(average(candidate.amounts));
      return {
        payee_id: candidate.payeeId ?? undefined,
        payee_name: candidate.payeeName,
        cadence,
        occurrence_count: candidate.dates.length,
        average_amount: formatMilliunits(averageAmount),
        estimated_monthly_cost: formatMilliunits(averageAmount),
        annualized_cost: formatMilliunits(averageAmount * 12),
        sort_amount: averageAmount,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((left, right) => right.sort_amount - left.sort_amount)
    .slice(0, topN)
    .map(({ sort_amount: _sortAmount, ...entry }) => entry);

  return {
    from_date: input.fromDate,
    to_date: input.toDate,
    recurring_expense_count: recurringExpenses.length,
    recurring_expenses: recurringExpenses,
  };
}

export async function getEmergencyFundCoverage(
  ynabClient: YnabClient,
  input: { planId?: string; asOfMonth: string; monthsBack?: number },
) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const monthsBack = input.monthsBack ?? 3;
  const [accounts, months, scheduledTransactions] = await Promise.all([
    ynabClient.listAccounts(planId),
    ynabClient.listPlanMonths(planId),
    ynabClient.listScheduledTransactions(planId),
  ]);
  const liquidCash = buildAccountSnapshotSummary(accounts).liquidCashMilliunits;
  const consideredMonths = months
    .filter((month) => !month.deleted && month.month <= input.asOfMonth)
    .sort((left, right) => right.month.localeCompare(left.month))
    .slice(0, monthsBack);
  const averageMonthlySpending = consideredMonths.length
    ? consideredMonths.reduce(
        (sum, month) => sum + toSpentFromActivity(month.activity),
        0,
      ) / consideredMonths.length
    : 0;
  const asOfDate = toNextDateFromMonth(input.asOfMonth);
  const scheduledNetNext30d = scheduledTransactions
    .filter(isNonTransferScheduledTransaction)
    .filter((transaction) => {
      const dueInDays = daysUntil(asOfDate, transaction.dateNext!);
      return dueInDays >= 0 && dueInDays <= 30;
    })
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const coverageMonths =
    averageMonthlySpending === 0
      ? undefined
      : liquidCash / averageMonthlySpending;
  const status =
    coverageMonths == null
      ? "no_spending"
      : coverageMonths >= 6
        ? "strong"
        : coverageMonths >= 3
          ? "solid"
          : coverageMonths >= 1
            ? "thin"
            : "critical";

  return compactObject({
    as_of_month: input.asOfMonth,
    liquid_cash: formatMilliunits(liquidCash),
    average_monthly_spending: formatMilliunits(
      Math.round(averageMonthlySpending),
    ),
    scheduled_net_next_30d: formatMilliunits(scheduledNetNext30d),
    coverage_months: coverageMonths?.toFixed(2),
    status,
    months_considered: consideredMonths.length,
  });
}

export async function getGoalProgressSummary(
  ynabClient: YnabClient,
  input: FinancialHealthInput,
) {
  const topN = resolveTopN(input);
  const { monthDetail } = await getMonthDetailContext(ynabClient, input);
  const goalCategories = (monthDetail.categories ?? []).filter(
    (category) =>
      !category.deleted &&
      !category.hidden &&
      category.goalUnderFunded !== undefined,
  );
  const underfundedGoals = goalCategories
    .filter((category) => (category.goalUnderFunded ?? 0) > 0)
    .sort(
      (left, right) =>
        (right.goalUnderFunded ?? 0) - (left.goalUnderFunded ?? 0),
    );

  return {
    month: monthDetail.month,
    goal_count: goalCategories.length,
    underfunded_total: formatMilliunits(
      underfundedGoals.reduce(
        (sum, category) => sum + (category.goalUnderFunded ?? 0),
        0,
      ),
    ),
    on_track_count: goalCategories.filter(
      (category) => (category.goalUnderFunded ?? 0) === 0,
    ).length,
    off_track_count: underfundedGoals.length,
    top_underfunded_goals: underfundedGoals.slice(0, topN).map((category) =>
      compactObject({
        id: category.id,
        name: category.name,
        amount: formatMilliunits(category.goalUnderFunded ?? 0),
      }),
    ),
  };
}

export async function getDebtSummary(
  ynabClient: YnabClient,
  input: { planId?: string; topN?: number },
) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const topN = resolveTopN(input);
  const accounts = (await ynabClient.listAccounts(planId)).filter(
    (account) => !account.deleted && !account.closed,
  );
  const debtAccounts = accounts
    .filter((account) => account.balance < 0)
    .sort((left, right) => left.balance - right.balance);
  const snapshot = buildAccountSnapshotSummary(accounts);
  const totalDebt = debtAccounts.reduce(
    (sum, account) => sum + Math.abs(account.balance),
    0,
  );
  const liquidCash = snapshot.liquidCashMilliunits;
  const ratio =
    totalDebt === 0
      ? 0
      : liquidCash === 0
        ? Number.POSITIVE_INFINITY
        : totalDebt / liquidCash;
  const status =
    totalDebt === 0
      ? "none"
      : ratio <= 1
        ? "manageable"
        : ratio <= 2
          ? "watch"
          : "high";

  return compactObject({
    total_debt: formatMilliunits(totalDebt),
    liquid_cash: formatMilliunits(liquidCash),
    debt_account_count: debtAccounts.length,
    debt_to_cash_ratio: Number.isFinite(ratio) ? ratio.toFixed(2) : undefined,
    status,
    top_debt_accounts: debtAccounts.slice(0, topN).map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      balance: formatMilliunits(Math.abs(account.balance)),
    })),
  });
}

export async function getBudgetCleanupSummary(
  ynabClient: YnabClient,
  input: FinancialHealthInput,
) {
  const topN = resolveTopN(input);
  const { monthDetail, transactions } = await getMonthTransactionContext(
    ynabClient,
    input,
  );
  const monthTransactions = transactions.filter(
    (transaction) =>
      !transaction.deleted &&
      !transaction.transferAccountId &&
      toMonthKey(transaction.date) === monthDetail.month,
  );
  const uncategorizedTransactions = monthTransactions.filter(
    (transaction) => !transaction.categoryId,
  );
  const unapprovedTransactions = monthTransactions.filter(
    (transaction) => !transaction.approved,
  );
  const unclearedTransactions = monthTransactions.filter(
    (transaction) => transaction.cleared === "uncleared",
  );
  const overspentCategories = (monthDetail.categories ?? [])
    .filter(
      (category) =>
        !category.deleted && !category.hidden && category.balance < 0,
    )
    .sort((left, right) => left.balance - right.balance);
  const hiddenProblemCategories = (monthDetail.categories ?? []).filter(
    (category) =>
      !category.deleted &&
      category.hidden &&
      (category.balance < 0 || (category.goalUnderFunded ?? 0) > 0),
  );

  return {
    month: monthDetail.month,
    uncategorized_transaction_count: uncategorizedTransactions.length,
    unapproved_transaction_count: unapprovedTransactions.length,
    uncleared_transaction_count: unclearedTransactions.length,
    overspent_category_count: overspentCategories.length,
    hidden_problem_category_count: hiddenProblemCategories.length,
    top_uncategorized_transactions: uncategorizedTransactions
      .slice()
      .sort((left, right) => Math.abs(right.amount) - Math.abs(left.amount))
      .slice(0, topN)
      .map((transaction) =>
        compactObject({
          id: transaction.id,
          date: transaction.date,
          payee_name: transaction.payeeName ?? undefined,
          account_name: transaction.accountName,
          amount: formatMilliunits(Math.abs(transaction.amount)),
        }),
      ),
    top_unapproved_transactions: unapprovedTransactions
      .slice()
      .sort((left, right) => Math.abs(right.amount) - Math.abs(left.amount))
      .slice(0, topN)
      .map((transaction) =>
        compactObject({
          id: transaction.id,
          date: transaction.date,
          payee_name: transaction.payeeName ?? undefined,
          amount: formatMilliunits(Math.abs(transaction.amount)),
        }),
      ),
    top_overspent_categories: overspentCategories
      .slice(0, topN)
      .map((category) => ({
        id: category.id,
        name: category.name,
        amount: formatMilliunits(Math.abs(category.balance)),
      })),
  };
}

function reconstructHistoricalBalances(
  accounts: YnabAccountSummary[],
  transactions: YnabTransaction[],
  months: string[],
) {
  const balances = new Map(
    accounts.map((account) => [account.id, account.balance]),
  );
  const transactionsByMonthDesc = transactions
    .filter((transaction) => !transaction.deleted && transaction.accountId)
    .map((transaction) => ({
      accountId: transaction.accountId!,
      amount: transaction.amount,
      id: transaction.id,
      month: toMonthKey(transaction.date),
    }))
    .sort(
      (left, right) =>
        right.month.localeCompare(left.month) ||
        left.id.localeCompare(right.id),
    );
  const balancesByMonth = new Map<string, Map<string, number>>();
  let transactionIndex = 0;

  for (const month of months
    .slice()
    .sort((left, right) => right.localeCompare(left))) {
    while (
      transactionIndex < transactionsByMonthDesc.length &&
      transactionsByMonthDesc[transactionIndex]!.month > month
    ) {
      const transaction = transactionsByMonthDesc[transactionIndex]!;
      balances.set(
        transaction.accountId,
        (balances.get(transaction.accountId) ?? 0) - transaction.amount,
      );
      transactionIndex += 1;
    }

    balancesByMonth.set(month, new Map(balances));
  }

  return balancesByMonth;
}

function summarizeBalances(
  month: string,
  balances: Map<string, number>,
  accounts: YnabAccountSummary[],
) {
  const monthAccounts = accounts.map((account) => ({
    ...account,
    balance: balances.get(account.id) ?? account.balance,
  }));
  const snapshot = buildAccountSnapshotSummary(monthAccounts);
  const debt = monthAccounts
    .filter(
      (account) => !account.deleted && !account.closed && account.balance < 0,
    )
    .reduce((sum, account) => sum + Math.abs(account.balance), 0);

  return {
    month,
    net_worth: formatMilliunits(snapshot.netWorthMilliunits),
    liquid_cash: formatMilliunits(snapshot.liquidCashMilliunits),
    debt: formatMilliunits(debt),
  };
}

export async function getNetWorthTrajectory(
  ynabClient: YnabClient,
  input: { planId?: string; fromMonth?: string; toMonth?: string },
) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const { fromMonth, toMonth } = await resolveMonthRange(
    ynabClient,
    planId,
    input.fromMonth,
    input.toMonth,
  );
  const [accounts, transactions] = await Promise.all([
    ynabClient.listAccounts(planId),
    ynabClient.listTransactions(planId, fromMonth),
  ]);
  const months = listMonthsInRange(fromMonth, toMonth);
  const balancesByMonth = reconstructHistoricalBalances(
    accounts.filter((account) => !account.deleted),
    transactions,
    months,
  );
  const monthSummaries = months.map((month) =>
    summarizeBalances(month, balancesByMonth.get(month) ?? new Map(), accounts),
  );
  const startSummary = monthSummaries[0];
  const endSummary = monthSummaries[monthSummaries.length - 1];

  return {
    from_month: fromMonth,
    to_month: toMonth,
    start_net_worth: startSummary?.net_worth ?? formatMilliunits(0),
    end_net_worth: endSummary?.net_worth ?? formatMilliunits(0),
    change_net_worth: formatMilliunits(
      Number.parseFloat(endSummary?.net_worth ?? "0") * 1000 -
        Number.parseFloat(startSummary?.net_worth ?? "0") * 1000,
    ),
    months: monthSummaries,
  };
}
