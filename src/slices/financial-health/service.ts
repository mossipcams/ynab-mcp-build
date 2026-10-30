import type {
  YnabAccountSummary,
  YnabClient,
  YnabPlanMonthDetail,
  YnabTransaction,
} from "../../platform/ynab/client.js";
import { compactObject } from "../../shared/object.js";
import { resolvePlanId } from "../../shared/plans.js";
import {
  calculateLinearRegressionSlope,
  calculatePearsonCorrelation,
  calculateZScore,
} from "../../shared/statistics.js";
import {
  buildAccountSnapshotSummary,
  buildAssignedSpentSummary,
  buildVisibleCategoryHealthSummary,
  formatMilliunits,
  toSpentMilliunits,
} from "./helpers.js";

// timeZone is server configuration (YNAB_TIME_ZONE), not a tool input; it
// decides which calendar day "today" is.
type Clock = { asOfDate?: string; timeZone?: string };

export type FinancialHealthInput = {
  planId?: string;
  month?: string;
  topN?: number;
  detailLevel?: DetailLevel;
  timeZone?: string;
};

export type BudgetChangeDigestInput = FinancialHealthInput;

export type MonthDeltaInput = {
  planId?: string;
  baselineMonth: string;
  comparisonMonth: string;
  topN?: number;
  detailLevel?: DetailLevel;
};

export type FinancialHealthRangeInput = {
  planId?: string;
  fromMonth?: string;
  toMonth?: string;
  topN?: number;
  detailLevel?: DetailLevel;
  timeZone?: string;
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
  timeZone?: string;
};

type DisplayRollup = {
  id?: string;
  name: string;
  amount: string;
  transaction_count?: number;
};

type SpendingCategoryLine = {
  transactionId: string;
  amountMilliunits: number;
  categoryId?: string;
  categoryName?: string;
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

type DetailLevel = "normal" | "detailed";

const DIGEST_ATTENTION_THRESHOLD_MILLIUNITS = 50_000;
const ANOMALY_Z_SCORE_THRESHOLD = 2;
const MIN_Z_SCORE_BASELINE_MONTHS = 2;

export async function getBudgetChangeDigest(
  ynabClient: YnabClient,
  input: BudgetChangeDigestInput,
) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const month = await resolveMonth(ynabClient, planId, input.month, input);
  const previousMonth = addMonths(month, -1);
  const topN = resolveTopN(input);
  const [
    monthDetail,
    previousMonthDetail,
    transactions,
    scheduledTransactions,
    offBudgetAccountIds,
  ] = await Promise.all([
    ynabClient.getPlanMonth(planId, month),
    ynabClient.getPlanMonth(planId, previousMonth),
    ynabClient.listTransactions(planId, month, endOfMonth(month)),
    ynabClient.listScheduledTransactions(planId),
    listOffBudgetAccountIds(ynabClient, planId),
  ]);

  const topChanges = buildDigestTopChanges(
    monthDetail.categories ?? [],
    previousMonthDetail.categories ?? [],
    topN,
  );
  const categoryPressure = buildDigestCategoryPressure(
    monthDetail.categories ?? [],
    topN,
  );
  const newLargeTransactions = buildDigestLargeTransactions(
    toBudgetTransactions(transactions, offBudgetAccountIds, month),
    topN,
  );
  const upcomingObligations = buildDigestUpcomingObligations(
    scheduledTransactions,
    `${month.slice(0, 7)}-01`,
    topN,
    offBudgetAccountIds,
  );
  const unusualSpending = topChanges.filter(
    (change) => change.reason === "spending_increased",
  );
  const recommendedActions = buildDigestRecommendations({
    categoryPressure,
    topChanges,
    upcomingObligations,
  }).slice(0, topN);
  const signalCount =
    topChanges.length +
    categoryPressure.length +
    newLargeTransactions.length +
    upcomingObligations.length;

  return {
    month,
    headline:
      signalCount === 0
        ? `No notable budget changes need attention for ${month.slice(0, 7)}.`
        : `${signalCount} budget signals need attention for ${month.slice(0, 7)}.`,
    top_changes: topChanges,
    new_large_transactions: newLargeTransactions,
    category_pressure: categoryPressure,
    unusual_spending: unusualSpending,
    upcoming_obligations: upcomingObligations,
    recommended_actions: recommendedActions,
  };
}

export async function explainMonthDelta(
  ynabClient: YnabClient,
  input: MonthDeltaInput,
) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const topN = resolveTopN(input);
  const [baseline, comparison, transactions, offBudgetAccountIds] =
    await Promise.all([
      ynabClient.getPlanMonth(planId, input.baselineMonth),
      ynabClient.getPlanMonth(planId, input.comparisonMonth),
      ynabClient.listTransactions(
        planId,
        input.comparisonMonth,
        endOfMonth(input.comparisonMonth),
      ),
      listOffBudgetAccountIds(ynabClient, planId),
    ]);
  const baselineSpending = toSpentFromActivity(baseline.activity);
  const comparisonSpending = toSpentFromActivity(comparison.activity);
  const incomeDelta = (comparison.income ?? 0) - (baseline.income ?? 0);
  const spendingDelta = comparisonSpending - baselineSpending;
  const drivers = [
    ...buildMonthDeltaDriver(
      "income",
      incomeDelta,
      incomeDelta < 0 ? "income_decreased" : "income_increased",
    ),
    ...buildMonthDeltaDriver(
      "spending",
      spendingDelta,
      spendingDelta > 0 ? "spending_increased" : "spending_decreased",
    ),
  ]
    .sort(
      (left, right) =>
        right.amountMilliunits - left.amountMilliunits ||
        left.code.localeCompare(right.code),
    )
    .slice(0, topN)
    .map((driver) => ({
      code: driver.code,
      area: driver.area,
      amount: formatMilliunits(driver.amountMilliunits),
    }));

  return {
    baseline_month: input.baselineMonth,
    comparison_month: input.comparisonMonth,
    summary: `Compared ${input.comparisonMonth.slice(0, 7)} with ${input.baselineMonth.slice(0, 7)} across income, spending, and category movement.`,
    drivers,
    category_deltas: buildDigestTopChanges(
      comparison.categories ?? [],
      baseline.categories ?? [],
      topN,
    ),
    transaction_evidence: buildDigestLargeTransactions(
      toBudgetTransactions(
        transactions,
        offBudgetAccountIds,
        input.comparisonMonth,
      ),
      topN,
    ),
  };
}

function resolveTopN(input: { topN?: number; detailLevel?: DetailLevel }) {
  if (input.topN !== undefined) {
    return input.topN;
  }

  const detailLevel = input.detailLevel ?? "normal";

  return detailLevel === "detailed" ? 10 : 5;
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

function currentCalendarMonth(clock: Clock = {}) {
  const today = currentCalendarDate(clock);

  return `${today.slice(0, 7)}-01`;
}

function currentCalendarDate(clock: Clock = {}) {
  if (clock.asOfDate) {
    return clock.asOfDate;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: clock.timeZone ?? "UTC",
    year: "numeric",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value;

  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);

  return next.toISOString().slice(0, 10);
}

// Same day-of-month `months` later, clamped to the end of shorter months.
function addMonthsToDate(date: string, months: number) {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month - 1 + months + 1, 0));

  return new Date(
    Date.UTC(year, month - 1 + months, Math.min(day, lastDay.getUTCDate())),
  )
    .toISOString()
    .slice(0, 10);
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

function toConfiguredMilliunitThreshold(value: number | undefined) {
  if (value === undefined) {
    return 50_000;
  }

  return Math.round(value * 1000);
}

function toMonthKey(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function toNextDateFromMonth(asOfMonth: string) {
  return `${asOfMonth.slice(0, 7)}-01`;
}

function toCashResilienceScheduledAsOfDate(
  month: string,
  inputMonth: string | undefined,
  clock: Clock,
) {
  return !isExplicitMonth(inputMonth) && month === currentCalendarMonth(clock)
    ? currentCalendarDate(clock)
    : toNextDateFromMonth(month);
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
  clock: Clock = {},
) {
  if (isExplicitMonth(month)) {
    return month;
  }

  const months = await ynabClient.listPlanMonths(planId);
  const visibleMonths = months.filter((entry) => !entry.deleted);
  const calendarMonth = currentCalendarMonth(clock);
  const resolvedMonth =
    visibleMonths
      .filter((entry) => entry.month <= calendarMonth)
      .sort((left, right) => right.month.localeCompare(left.month))[0]?.month ??
    visibleMonths.sort((left, right) =>
      right.month.localeCompare(left.month),
    )[0]?.month ??
    months[0]?.month;

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
  clock: Clock = {},
) {
  const resolvedFromMonth = await resolveMonth(
    ynabClient,
    planId,
    fromMonth,
    clock,
  );
  const resolvedToMonth = toMonth
    ? await resolveMonth(ynabClient, planId, toMonth, clock)
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
  const month = await resolveMonth(ynabClient, planId, input.month, input);
  const monthDetail = await ynabClient.getPlanMonth(planId, month);

  return { planId, month, monthDetail };
}

async function getMonthAccountContext(
  ynabClient: YnabClient,
  input: FinancialHealthInput,
) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const month = await resolveMonth(ynabClient, planId, input.month, input);
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
  const month = await resolveMonth(ynabClient, planId, input.month, input);
  const [monthDetail, transactions, offBudgetAccountIds] = await Promise.all([
    ynabClient.getPlanMonth(planId, month),
    ynabClient.listTransactions(planId, month, endOfMonth(month)),
    listOffBudgetAccountIds(ynabClient, planId),
  ]);

  return {
    planId,
    month,
    monthDetail,
    budgetTransactions: toBudgetTransactions(
      transactions,
      offBudgetAccountIds,
      monthDetail.month,
    ),
  };
}

async function getMonthContext(
  ynabClient: YnabClient,
  input: FinancialHealthInput,
) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const month = await resolveMonth(ynabClient, planId, input.month, input);
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
    input,
  );
  const [months, transactions, offBudgetAccountIds] = await Promise.all([
    ynabClient.listPlanMonths(planId),
    ynabClient.listTransactions(planId, fromMonth, endOfMonth(toMonth)),
    listOffBudgetAccountIds(ynabClient, planId),
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

  return {
    planId,
    fromMonth,
    toMonth,
    months: visibleMonths,
    budgetTransactions: toBudgetTransactions(
      transactions,
      offBudgetAccountIds,
      fromMonth,
      toMonth,
    ),
  };
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
  const goalCategories = categories.filter(
    (category) =>
      !category.deleted &&
      !category.hidden &&
      category.goalUnderFunded !== undefined,
  );
  const underfundedGoals = goalCategories
    .filter((category) => (category.goalUnderFunded ?? 0) > 0)
    .sort(
      (left, right) =>
        (right.goalUnderFunded ?? 0) - (left.goalUnderFunded ?? 0) ||
        left.name.localeCompare(right.name),
    );

  return {
    month: monthDetail.month,
    age_of_money: monthDetail.ageOfMoney,
    ready_to_assign: formatMilliunits(monthDetail.toBeBudgeted ?? 0),
    available_total: formatMilliunits(summary.availableTotalMilliunits),
    positive_available_total: formatMilliunits(
      summary.positiveAvailableTotalMilliunits,
    ),
    net_available_total: formatMilliunits(summary.netAvailableTotalMilliunits),
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
    goal_count: goalCategories.length,
    underfunded_goal_total: formatMilliunits(
      underfundedGoals.reduce(
        (sum, category) => sum + (category.goalUnderFunded ?? 0),
        0,
      ),
    ),
    off_track_goal_count: underfundedGoals.length,
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
    top_underfunded_goals: underfundedGoals.slice(0, topN).map((category) =>
      compactObject({
        id: category.id,
        name: category.name,
        amount: formatMilliunits(category.goalUnderFunded ?? 0),
      }),
    ),
  };
}

type FlowEntry = {
  amount: number;
  categoryId?: string | null;
  categoryName?: string | null;
  transferAccountId?: string | null;
  transferAccountOnBudget?: boolean;
  deleted?: boolean;
};

// On-budget transfers net to zero; transfers to tracking/loan accounts
// (e.g. a mortgage payment) leave the budget and are real spending in YNAB.
function isBudgetFlowEntry(entry: FlowEntry, offBudgetAccountIds: Set<string>) {
  return (
    !entry.transferAccountId ||
    entry.transferAccountOnBudget === false ||
    offBudgetAccountIds.has(entry.transferAccountId)
  );
}

// Tracking/loan account rows (401k adjustments, loan interest) never touch
// the budget; net worth reads them separately.
function isOffBudgetAccountEntry(
  entry: { accountId?: string | null; accountOnBudget?: boolean },
  offBudgetAccountIds: Set<string>,
) {
  return (
    entry.accountOnBudget === false ||
    Boolean(entry.accountId && offBudgetAccountIds.has(entry.accountId))
  );
}

// Live split lines replace the parent.
function toLiveLines(
  transaction: FlowEntry & { subtransactions?: FlowEntry[] | undefined },
): FlowEntry[] {
  const liveSubtransactions =
    transaction.subtransactions?.filter(
      (subtransaction) => !subtransaction.deleted,
    ) ?? [];

  return liveSubtransactions.length > 0 ? liveSubtransactions : [transaction];
}

// The lines that move budget money, so a split made only of budget ↔ budget
// transfers contributes nothing.
function toBudgetFlowLines(
  transaction: FlowEntry & { subtransactions?: FlowEntry[] | undefined },
  offBudgetAccountIds: Set<string>,
) {
  return toLiveLines(transaction).filter((entry) =>
    isBudgetFlowEntry(entry, offBudgetAccountIds),
  );
}

function sumAmounts(entries: Array<{ amount: number }>) {
  return entries.reduce((sum, entry) => sum + entry.amount, 0);
}

function toOffBudgetAccountIds(
  accounts: Array<{ id: string; onBudget?: boolean }>,
) {
  return new Set(
    accounts
      .filter((account) => account.onBudget === false)
      .map((account) => account.id),
  );
}

async function listOffBudgetAccountIds(ynabClient: YnabClient, planId: string) {
  // ponytail: optional probe like listCategories in category trends; minimal
  // test clients omit listAccounts. Cast: YnabClient declares it required.
  const { listAccounts } = ynabClient as Partial<YnabClient>;

  return toOffBudgetAccountIds(
    listAccounts ? await listAccounts.call(ynabClient, planId) : [],
  );
}

// The budget's view of transactions: live, on-budget (tracking-account
// activity never moves budget money), dated within the month range, and
// carrying only the amount that moves budget money.
function toBudgetTransactions(
  transactions: YnabTransaction[],
  offBudgetAccountIds: Set<string>,
  fromMonth: string,
  toMonth: string = fromMonth,
): YnabTransaction[] {
  return transactions.flatMap((transaction) => {
    const monthKey = toMonthKey(transaction.date);

    if (
      transaction.deleted ||
      monthKey < fromMonth ||
      monthKey > toMonth ||
      isOffBudgetAccountEntry(transaction, offBudgetAccountIds)
    ) {
      return [];
    }

    const lines = toBudgetFlowLines(transaction, offBudgetAccountIds);

    return lines.length === 0
      ? []
      : [
          {
            ...transaction,
            amount: sumAmounts(lines),
            // Downstream line readers (toLiveLines) see only the kept lines.
            ...(transaction.subtransactions
              ? {
                  subtransactions: transaction.subtransactions.filter(
                    (subtransaction) => lines.includes(subtransaction),
                  ),
                }
              : {}),
          },
        ];
  });
}

function toSpendingCategoryLine(input: {
  transactionId: string;
  amount: number;
  categoryId: string | null | undefined;
  categoryName: string | null | undefined;
}): SpendingCategoryLine | null {
  if (input.amount === 0) {
    return null;
  }

  const line: SpendingCategoryLine = {
    amountMilliunits: -input.amount,
    transactionId: input.transactionId,
  };

  if (input.categoryId) {
    line.categoryId = input.categoryId;
  }

  if (input.categoryName) {
    line.categoryName = input.categoryName;
  }

  return line;
}

// Expects a toBudgetTransactions entry: excluded lines are already gone.
function toSpendingCategoryLines(
  transaction: YnabTransaction,
): SpendingCategoryLine[] {
  return toLiveLines(transaction).flatMap((entry) => {
    const line = toSpendingCategoryLine({
      amount: entry.amount,
      categoryId: entry.categoryId,
      categoryName: entry.categoryName,
      transactionId: transaction.id,
    });

    return line ? [line] : [];
  });
}

function isReadyToAssignIncome(entry: { categoryName?: string | null }) {
  const categoryName = entry.categoryName?.trim().toLowerCase();

  return (
    categoryName === "ready to assign" ||
    categoryName === "inflow: ready to assign"
  );
}

// Credit card payment activity is new card spending minus payments; the
// spending itself already shows in the real categories.
function toCategorySpent(category: {
  categoryGroupName?: string;
  activity?: number;
}) {
  return category.categoryGroupName === "Credit Card Payments"
    ? 0
    : toSpentFromActivity(category.activity);
}

type ScheduledFlowTransaction = FlowEntry & {
  id: string;
  accountId?: string | null;
  accountOnBudget?: boolean;
  dateNext?: string | null;
  frequency?: string | null;
  subtransactions?: FlowEntry[] | undefined;
};

const SCHEDULED_FREQUENCY_STEPS: Record<
  string,
  { days: number } | { months: number }
> = {
  daily: { days: 1 },
  weekly: { days: 7 },
  everyOtherWeek: { days: 14 },
  // ponytail: twice a month approximated as every 15 days; exact only for the
  // 30-day windows used here, not for long horizons.
  twiceAMonth: { days: 15 },
  every4Weeks: { days: 28 },
  monthly: { months: 1 },
  everyOtherMonth: { months: 2 },
  every3Months: { months: 3 },
  every4Months: { months: 4 },
  twiceAYear: { months: 6 },
  yearly: { months: 12 },
  everyOtherYear: { months: 24 },
};

// Occurrences due within [asOfDate, asOfDate + horizonDays], starting at
// dateNext. A past dateNext is not itself counted (YNAB enters scheduled
// transactions on their due date, so it is already a real transaction), but
// its later repeats are.
function listScheduledOccurrences(
  transaction: ScheduledFlowTransaction,
  asOfDate: string,
  horizonDays: number,
) {
  const dateNext = transaction.dateNext;
  if (!dateNext) {
    return [];
  }

  const step = SCHEDULED_FREQUENCY_STEPS[transaction.frequency ?? "never"];
  const occurrences: Array<{ date: string; daysUntilDue: number }> = [];

  for (let index = 0; index === 0 || step; index += 1) {
    const date = !step
      ? dateNext
      : "months" in step
        ? addMonthsToDate(dateNext, step.months * index)
        : addDays(dateNext, step.days * index);
    const daysUntilDue = daysUntil(asOfDate, date);

    if (daysUntilDue > horizonDays) {
      break;
    }

    if (daysUntilDue >= 0) {
      occurrences.push({ date, daysUntilDue });
    }
  }

  return occurrences;
}

// One entry per due occurrence, carrying only the budget-money amount.
function toScheduledBudgetOccurrences<T extends ScheduledFlowTransaction>(
  scheduledTransactions: T[],
  asOfDate: string,
  horizonDays: number,
  offBudgetAccountIds: Set<string>,
) {
  return scheduledTransactions.flatMap((transaction) => {
    const lines =
      transaction.deleted ||
      isOffBudgetAccountEntry(transaction, offBudgetAccountIds)
        ? []
        : toBudgetFlowLines(transaction, offBudgetAccountIds);

    if (lines.length === 0) {
      return [];
    }

    const amount = sumAmounts(lines);

    return listScheduledOccurrences(transaction, asOfDate, horizonDays).map(
      (occurrence) => ({
        ...transaction,
        amount,
        dateNext: occurrence.date,
        daysUntilDue: occurrence.daysUntilDue,
      }),
    );
  });
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
          .map((category) => [category.id, toCategorySpent(category)] as const),
      ),
  );

  return latestCategories
    .filter((category) => !category.deleted && !category.hidden)
    .map((category) => {
      const latestSpent = toCategorySpent(category);
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
      const spendingZScore = calculateZScore(latestSpent, baselineValues);
      const hasVariableBaseline = baselineValues.some(
        (value) => value !== baselineValues[0],
      );

      return {
        category_id: category.id,
        category_name: category.name,
        latestSpent,
        baselineAverage,
        baselineValues,
        hasVariableBaseline,
        increase,
        increasePercent,
        spendingZScore,
      };
    })
    .filter((entry) => entry.increase >= options.minimumDifference)
    .filter((entry) =>
      entry.baselineAverage > 0
        ? entry.latestSpent >=
          entry.baselineAverage * options.thresholdMultiplier
        : entry.latestSpent > 0,
    )
    .filter((entry) =>
      entry.baselineValues.length >= MIN_Z_SCORE_BASELINE_MONTHS &&
      entry.hasVariableBaseline
        ? (entry.spendingZScore ?? 0) >= ANOMALY_Z_SCORE_THRESHOLD
        : true,
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
        z_score: entry.spendingZScore?.toFixed(4),
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
      transactionIds: Set<string>;
    }
  >();

  for (const transaction of transactions.filter((entry) => entry.amount < 0)) {
    for (const line of toSpendingCategoryLines(transaction)) {
      const key = line.categoryId ?? "uncategorized";
      const current = rollups.get(key);

      if (current) {
        current.amountMilliunits += line.amountMilliunits;
        current.transactionIds.add(line.transactionId);
        continue;
      }

      rollups.set(key, {
        ...(line.categoryId ? { id: line.categoryId } : {}),
        name: line.categoryName ?? "Uncategorized",
        amountMilliunits: line.amountMilliunits,
        transactionIds: new Set([line.transactionId]),
      });
    }
  }

  return Array.from(rollups.values())
    .filter((entry) => entry.amountMilliunits > 0)
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
        transaction_count: entry.transactionIds.size,
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

function visibleDigestCategories(categories: FinancialHealthCategory[]) {
  return categories.filter((category) => !category.deleted && !category.hidden);
}

function buildDigestTopChanges(
  currentCategories: FinancialHealthCategory[],
  previousCategories: FinancialHealthCategory[],
  topN: number,
) {
  const previousById = new Map(
    visibleDigestCategories(previousCategories).map((category) => [
      category.id,
      category,
    ]),
  );

  return visibleDigestCategories(currentCategories)
    .map((category) => {
      const previous = previousById.get(category.id);
      const currentSpent = toCategorySpent(category);
      const previousSpent = previous ? toCategorySpent(previous) : 0;
      const spendingIncrease = currentSpent - previousSpent;
      const availableDrop = (previous?.balance ?? 0) - category.balance;
      const assignedChange = Math.abs(
        (category.budgeted ?? 0) - (previous?.budgeted ?? 0),
      );
      const candidates = [
        {
          amountMilliunits: spendingIncrease,
          reason: "spending_increased",
        },
        {
          amountMilliunits: availableDrop,
          reason: "available_dropped",
        },
        {
          amountMilliunits: assignedChange,
          reason: "assigned_changed",
        },
      ].filter((entry) => entry.amountMilliunits > 0);
      const strongest = candidates.sort(
        (left, right) =>
          right.amountMilliunits - left.amountMilliunits ||
          left.reason.localeCompare(right.reason),
      )[0];

      if (!strongest) {
        return null;
      }

      return {
        category_id: category.id,
        category_name: category.name,
        isOverspent: category.balance < 0,
        reason: strongest.reason,
        amountMilliunits: strongest.amountMilliunits,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .filter(
      (entry) =>
        entry.isOverspent ||
        entry.amountMilliunits >= DIGEST_ATTENTION_THRESHOLD_MILLIUNITS,
    )
    .sort(
      (left, right) =>
        right.amountMilliunits - left.amountMilliunits ||
        left.category_name.localeCompare(right.category_name) ||
        left.category_id.localeCompare(right.category_id),
    )
    .slice(0, topN)
    .map((entry) => ({
      category_id: entry.category_id,
      category_name: entry.category_name,
      reason: entry.reason,
      amount: formatMilliunits(entry.amountMilliunits),
    }));
}

function buildDigestCategoryPressure(
  categories: FinancialHealthCategory[],
  topN: number,
) {
  return visibleDigestCategories(categories)
    .map((category) => {
      if (category.balance < 0) {
        return {
          category_id: category.id,
          category_name: category.name,
          pressure_reason: "overspent",
          severity: 2,
          amountMilliunits: Math.abs(category.balance),
          available: category.balance,
          activity: category.activity ?? 0,
        };
      }

      if ((category.goalUnderFunded ?? 0) > 0) {
        return {
          category_id: category.id,
          category_name: category.name,
          pressure_reason: "underfunded",
          severity: 1,
          amountMilliunits: category.goalUnderFunded ?? 0,
          available: category.balance,
          activity: category.activity ?? 0,
        };
      }

      return null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort(
      (left, right) =>
        right.severity - left.severity ||
        right.amountMilliunits - left.amountMilliunits ||
        left.category_name.localeCompare(right.category_name) ||
        left.category_id.localeCompare(right.category_id),
    )
    .slice(0, topN)
    .map((entry) => ({
      category_id: entry.category_id,
      category_name: entry.category_name,
      pressure_reason: entry.pressure_reason,
      amount: formatMilliunits(entry.amountMilliunits),
      available: formatMilliunits(entry.available),
      activity: formatMilliunits(toSpentFromActivity(entry.activity)),
    }));
}

function buildDigestLargeTransactions(
  budgetTransactions: YnabTransaction[],
  topN: number,
) {
  return budgetTransactions
    .filter(
      (transaction) =>
        Math.abs(transaction.amount) >= DIGEST_ATTENTION_THRESHOLD_MILLIUNITS,
    )
    .sort(
      (left, right) =>
        Math.abs(right.amount) - Math.abs(left.amount) ||
        right.date.localeCompare(left.date) ||
        left.id.localeCompare(right.id),
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

function buildDigestUpcomingObligations(
  scheduledTransactions: Array<
    ScheduledFlowTransaction & {
      payeeName?: string | null;
      accountName?: string | null;
    }
  >,
  asOfDate: string,
  topN: number,
  offBudgetAccountIds: Set<string>,
) {
  return toScheduledBudgetOccurrences(
    scheduledTransactions,
    asOfDate,
    30,
    offBudgetAccountIds,
  )
    .sort(
      (left, right) =>
        left.daysUntilDue - right.daysUntilDue ||
        Math.abs(right.amount) - Math.abs(left.amount) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, topN)
    .map((transaction) =>
      compactObject({
        id: transaction.id,
        date_next: transaction.dateNext,
        amount: formatMilliunits(Math.abs(transaction.amount)),
        payee_name: transaction.payeeName,
        category_name: transaction.categoryName,
        account_name: transaction.accountName,
        type: transaction.amount >= 0 ? "inflow" : "outflow",
      }),
    );
}

function buildDigestRecommendations(input: {
  categoryPressure: Array<{
    category_id: string;
    category_name: string;
    pressure_reason: string;
  }>;
  topChanges: Array<{
    category_id: string;
    category_name: string;
    reason: string;
  }>;
  upcomingObligations: Array<{ id?: string; payee_name?: string }>;
}) {
  const recommendations = new Map<
    string,
    {
      priority: "high" | "medium" | "low";
      action: string;
      reason: string;
      target: string;
    }
  >();

  for (const pressure of input.categoryPressure) {
    const key = `category:${pressure.category_id}`;
    recommendations.set(key, {
      action:
        pressure.pressure_reason === "overspent"
          ? `Cover overspending in ${pressure.category_name}.`
          : `Review funding for ${pressure.category_name}.`,
      priority: pressure.pressure_reason === "overspent" ? "high" : "medium",
      reason: pressure.pressure_reason,
      target: pressure.category_name,
    });
  }

  for (const change of input.topChanges) {
    const key = `category:${change.category_id}`;

    if (recommendations.has(key)) {
      continue;
    }

    recommendations.set(key, {
      action: `Inspect ${change.category_name} for ${change.reason.replaceAll("_", " ")}.`,
      priority: "low",
      reason: change.reason,
      target: change.category_name,
    });
  }

  const priorityRank = { high: 0, medium: 1, low: 2 };

  return Array.from(recommendations.values()).sort(
    (left, right) =>
      priorityRank[left.priority] - priorityRank[right.priority] ||
      left.target.localeCompare(right.target),
  );
}

function buildMonthDeltaDriver(area: string, delta: number, code: string) {
  if (delta === 0) {
    return [];
  }

  return [
    {
      amountMilliunits: Math.abs(delta),
      area,
      code,
    },
  ];
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
    total_debt: formatMilliunits(
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
  const cleanup = buildCleanupCounts(
    toBudgetTransactions(
      transactions,
      toOffBudgetAccountIds(accounts),
      monthDetail.month,
    ),
  );
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
  const { monthDetail, budgetTransactions: monthTransactions } =
    await getMonthTransactionContext(ynabClient, input);
  const budgetHealth = summarizeBudgetHealthMonth(monthDetail, topN);
  const inflowMilliunits = monthTransactions
    .filter((transaction) => transaction.amount > 0)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const outflowMilliunits = monthTransactions
    .filter((transaction) => transaction.amount < 0)
    .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  const spentMilliunits =
    monthTransactions.length > 0
      ? outflowMilliunits
      : toSpentFromActivity(monthDetail.activity);
  const assignedSpentSummary = buildAssignedSpentSummary(
    monthDetail.budgeted ?? 0,
    spentMilliunits,
  );

  return {
    month: monthDetail.month,
    income: formatMilliunits(monthDetail.income ?? 0),
    inflow: formatMilliunits(inflowMilliunits),
    outflow: formatMilliunits(outflowMilliunits),
    net_flow: formatMilliunits(inflowMilliunits - outflowMilliunits),
    ready_to_assign: budgetHealth.ready_to_assign,
    available_total: budgetHealth.available_total,
    positive_available_total: budgetHealth.positive_available_total,
    net_available_total: budgetHealth.net_available_total,
    overspent_total: budgetHealth.overspent_total,
    underfunded_total: budgetHealth.underfunded_total,
    assigned: assignedSpentSummary.assigned,
    spent: assignedSpentSummary.spent,
    assigned_vs_spent: assignedSpentSummary.assigned_vs_spent,
    top_spending_categories: toMonthSpendingRollups(monthTransactions, topN),
    ...(input.detailLevel === "detailed"
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
  const { fromMonth, toMonth, months, budgetTransactions } =
    await getRangeContext(ynabClient, input);
  const periodFlow = new Map<string, { inflow: number; outflow: number }>(
    months.map((month) => [month.month, { inflow: 0, outflow: 0 }]),
  );

  for (const transaction of budgetTransactions) {
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
  const { planId, fromMonth, toMonth, months, budgetTransactions } =
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
      transactionIds: Set<string>;
    }
  >();
  const categoryGroupRollups = new Map<
    string,
    { name: string; amountMilliunits: number; transactionIds: Set<string> }
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

  const spendingTransactions = budgetTransactions.filter(
    (transaction) => transaction.amount < 0,
  );
  const spendingEntries = spendingTransactions
    .map((transaction) => {
      const lines = toSpendingCategoryLines(transaction);
      const spendMilliunits = lines.reduce(
        (sum, line) => sum + line.amountMilliunits,
        0,
      );

      return {
        lines,
        spendMilliunits,
        transaction,
      };
    })
    .filter((entry) => entry.spendMilliunits > 0);

  for (const { lines, spendMilliunits, transaction } of spendingEntries) {
    const payeeId =
      transaction.payeeId ?? transaction.payeeName ?? "unknown-payee";
    const payeeName = transaction.payeeName ?? "Unknown Payee";

    for (const line of lines) {
      const categoryId = line.categoryId ?? "uncategorized";
      const categoryName = line.categoryName ?? "Uncategorized";
      const groupName = categoryGroupLookup.get(categoryId) ?? "Uncategorized";

      const categoryRollup = categoryRollups.get(categoryId);
      if (categoryRollup) {
        categoryRollup.amountMilliunits += line.amountMilliunits;
        categoryRollup.transactionIds.add(line.transactionId);
      } else {
        categoryRollups.set(categoryId, {
          ...(line.categoryId ? { id: line.categoryId } : {}),
          name: categoryName,
          amountMilliunits: line.amountMilliunits,
          transactionIds: new Set([line.transactionId]),
        });
      }

      const groupRollup = categoryGroupRollups.get(groupName);
      if (groupRollup) {
        groupRollup.amountMilliunits += line.amountMilliunits;
        groupRollup.transactionIds.add(line.transactionId);
      } else {
        categoryGroupRollups.set(groupName, {
          name: groupName,
          amountMilliunits: line.amountMilliunits,
          transactionIds: new Set([line.transactionId]),
        });
      }
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
  const spentMilliunits = spendingEntries.reduce(
    (sum, entry) => sum + entry.spendMilliunits,
    0,
  );

  return {
    from_month: fromMonth,
    to_month: toMonth,
    ...buildAssignedSpentSummary(assignedMilliunits, spentMilliunits),
    transaction_count: spendingEntries.length,
    average_transaction: formatMilliunits(
      spendingEntries.length
        ? Math.round(spentMilliunits / spendingEntries.length)
        : 0,
    ),
    top_categories: Array.from(categoryRollups.values())
      .filter((entry) => entry.amountMilliunits > 0)
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
          transaction_count: entry.transactionIds.size,
        }),
      ),
    top_category_groups: Array.from(categoryGroupRollups.values())
      .filter((entry) => entry.amountMilliunits > 0)
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
          transaction_count: entry.transactionIds.size,
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
    ...(input.detailLevel === "detailed"
      ? {
          example_transactions: toExampleTransactions(
            spendingEntries.map((entry) => entry.transaction),
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
  const minimumDifference = toConfiguredMilliunitThreshold(
    input.minimumDifference,
  );
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
    input,
  );
  const months = listMonthsInRange(fromMonth, toMonth);
  const listCategories = (
    ynabClient as { listCategories?: YnabClient["listCategories"] }
  ).listCategories;
  const [monthDetails, categoryGroups] = await Promise.all([
    Promise.all(months.map((month) => ynabClient.getPlanMonth(planId, month))),
    input.categoryGroupName && listCategories
      ? listCategories.call(ynabClient, planId)
      : Promise.resolve([]),
  ]);
  const scope = input.categoryId
    ? { type: "category", id: input.categoryId }
    : {
        type: "category_group",
        name: input.categoryGroupName,
        match_basis: "category_group_name",
      };
  const visibleMonthCategories = monthDetails.flatMap((monthDetail) =>
    (monthDetail.categories ?? []).filter(
      (category) => !category.deleted && !category.hidden,
    ),
  );
  const categoryGroupIds = new Set(
    categoryGroups
      .filter(
        (group) =>
          !group.deleted &&
          !group.hidden &&
          group.name === input.categoryGroupName,
      )
      .flatMap((group) =>
        group.categories
          .filter((category) => !category.deleted && !category.hidden)
          .map((category) => category.id),
      ),
  );
  const suggestedCategoryGroups = Array.from(
    new Set([
      ...categoryGroups
        .filter((group) => !group.deleted && !group.hidden)
        .map((group) => group.name),
      ...visibleMonthCategories.flatMap((category) =>
        category.categoryGroupName ? [category.categoryGroupName] : [],
      ),
    ]),
  ).sort((left, right) => left.localeCompare(right));
  const suggestedCategoriesById = new Map<
    string,
    { id: string; name: string }
  >();

  for (const category of visibleMonthCategories) {
    suggestedCategoriesById.set(category.id, {
      id: category.id,
      name: category.name,
    });
  }

  for (const group of categoryGroups) {
    if (group.deleted || group.hidden) {
      continue;
    }

    for (const category of group.categories) {
      if (category.deleted || category.hidden) {
        continue;
      }

      suggestedCategoriesById.set(category.id, {
        id: category.id,
        name: category.name,
      });
    }
  }

  const periods = monthDetails.map((monthDetail) => {
    const matchingCategories = (monthDetail.categories ?? []).filter(
      (category) => {
        if (category.deleted || category.hidden) {
          return false;
        }

        if (input.categoryId) {
          return category.id === input.categoryId;
        }

        return (
          category.categoryGroupName === input.categoryGroupName ||
          categoryGroupIds.has(category.id)
        );
      },
    );
    const assignedMilliunits = matchingCategories.reduce(
      (sum, category) => sum + (category.budgeted ?? 0),
      0,
    );
    const spentMilliunits = matchingCategories.reduce(
      (sum, category) => sum + toCategorySpent(category),
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
      matchingCategoryCount: matchingCategories.length,
    };
  });

  if (periods.every((period) => period.matchingCategoryCount === 0)) {
    return {
      status: "no_match",
      from_month: fromMonth,
      to_month: toMonth,
      scope,
      message: input.categoryId
        ? `No visible category matched id ${input.categoryId}.`
        : `No visible category group matched ${input.categoryGroupName}.`,
      suggestions: {
        category_groups: suggestedCategoryGroups.slice(0, 10),
        categories: Array.from(suggestedCategoriesById.values())
          .sort((left, right) => left.name.localeCompare(right.name))
          .slice(0, 10),
      },
      periods: [],
    };
  }

  // An in-progress month's partial spending would skew the trend statistics.
  const firstIncompleteMonth = currentCalendarMonth(input);
  const completedPeriods = periods.filter(
    (period) => period.month < firstIncompleteMonth,
  );
  const trendPeriods = completedPeriods.length > 0 ? completedPeriods : periods;
  const totalSpentMilliunits = trendPeriods.reduce(
    (sum, period) => sum + period.spentMilliunits,
    0,
  );
  const peakPeriod = trendPeriods.reduce(
    (peak, period) =>
      !peak || period.spentMilliunits > peak.spentMilliunits ? period : peak,
    trendPeriods[0],
  );
  const spentSlope = calculateLinearRegressionSlope(
    trendPeriods.map((period) => period.spentMilliunits),
  );
  const assignedSpentCorrelation = calculatePearsonCorrelation(
    trendPeriods.map((period) => period.assignedMilliunits),
    trendPeriods.map((period) => period.spentMilliunits),
  );

  return {
    from_month: fromMonth,
    to_month: toMonth,
    scope,
    average_spent: formatMilliunits(
      Math.round(totalSpentMilliunits / Math.max(trendPeriods.length, 1)),
    ),
    peak_month: peakPeriod?.month,
    spent_change: formatMilliunits(
      (trendPeriods[trendPeriods.length - 1]?.spentMilliunits ?? 0) -
        (trendPeriods[0]?.spentMilliunits ?? 0),
    ),
    trend: compactObject({
      spent_slope_per_month:
        spentSlope === undefined
          ? undefined
          : formatMilliunits(Math.round(spentSlope)),
      spent_direction:
        spentSlope === undefined
          ? undefined
          : spentSlope > 0
            ? "increasing"
            : spentSlope < 0
              ? "decreasing"
              : "flat",
      assigned_spent_correlation: assignedSpentCorrelation?.toFixed(4),
    }),
    periods: periods.map((period) => ({
      month: period.month,
      assigned: formatMilliunits(period.assignedMilliunits),
      spent: formatMilliunits(period.spentMilliunits),
      available: formatMilliunits(period.availableMilliunits),
    })),
  };
}

export async function getCashResilienceSummary(
  ynabClient: YnabClient,
  input: {
    planId?: string;
    month?: string;
    asOfDate?: string;
    monthsBack?: number;
    detailLevel?: DetailLevel;
    timeZone?: string;
  },
) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const month = await resolveMonth(ynabClient, planId, input.month, input);
  const monthsBack = input.monthsBack ?? 3;
  const [accounts, months, scheduledTransactions] = await Promise.all([
    ynabClient.listAccounts(planId),
    ynabClient.listPlanMonths(planId),
    ynabClient.listScheduledTransactions(planId),
  ]);
  const liquidCash = buildAccountSnapshotSummary(accounts).liquidCashMilliunits;
  // An in-progress month's partial activity would understate the average.
  const firstIncompleteMonth = currentCalendarMonth(input);
  const consideredMonths = months
    .filter(
      (entry) =>
        !entry.deleted &&
        entry.month <= month &&
        entry.month < firstIncompleteMonth,
    )
    .sort((left, right) => right.month.localeCompare(left.month))
    .slice(0, monthsBack);
  const averageMonthlySpending = consideredMonths.length
    ? consideredMonths.reduce(
        (sum, entry) => sum + toSpentFromActivity(entry.activity),
        0,
      ) / consideredMonths.length
    : 0;
  const averageDailyOutflow = averageMonthlySpending / 30;
  const asOfDate = toCashResilienceScheduledAsOfDate(month, input.month, input);
  const scheduledNetNext30d = sumAmounts(
    toScheduledBudgetOccurrences(
      scheduledTransactions,
      asOfDate,
      30,
      toOffBudgetAccountIds(accounts),
    ),
  );
  const coverageMonths =
    averageMonthlySpending === 0
      ? undefined
      : liquidCash / averageMonthlySpending;
  const runwayDays =
    averageDailyOutflow === 0 ? undefined : liquidCash / averageDailyOutflow;
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
    month,
    liquid_cash: formatMilliunits(liquidCash),
    average_monthly_spending: formatMilliunits(
      Math.round(averageMonthlySpending),
    ),
    average_daily_outflow: formatMilliunits(Math.round(averageDailyOutflow)),
    coverage_months: coverageMonths?.toFixed(2),
    runway_days: runwayDays?.toFixed(2),
    scheduled_net_next_30d: formatMilliunits(scheduledNetNext30d),
    status,
    months_considered: consideredMonths.length,
    ...(input.detailLevel === "detailed"
      ? {
          considered_months: consideredMonths.map((entry) => ({
            month: entry.month,
            spent: formatMilliunits(toSpentFromActivity(entry.activity)),
          })),
        }
      : {}),
  });
}

export async function getUpcomingObligations(
  ynabClient: YnabClient,
  input: {
    planId?: string;
    asOfDate?: string;
    topN?: number;
    detailLevel?: DetailLevel;
    timeZone?: string;
  },
) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const asOfDate = currentCalendarDate(input);
  const topN = resolveTopN(input);
  const [scheduled, offBudgetAccountIds] = await Promise.all([
    ynabClient.listScheduledTransactions(planId),
    listOffBudgetAccountIds(ynabClient, planId),
  ]);
  const scheduledTransactions = toScheduledBudgetOccurrences(
    scheduled,
    asOfDate,
    30,
    offBudgetAccountIds,
  )
    .filter((transaction) => transaction.amount !== 0)
    .map((transaction) => ({
      id: transaction.id,
      date_next: transaction.dateNext,
      payee_name: transaction.payeeName,
      category_name: transaction.categoryName,
      account_name: transaction.accountName,
      amount: transaction.amount,
      days_until_due: transaction.daysUntilDue,
    }))
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
        ...(input.detailLevel === "detailed"
          ? { signed_amount: formatMilliunits(transaction.amount) }
          : {}),
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
  const { fromMonth, toMonth, months, budgetTransactions } =
    await getRangeContext(ynabClient, input);
  // Split paychecks carry "Split" on the parent; income lives on the lines.
  const incomeTransactions = budgetTransactions.flatMap((transaction) => {
    const amount = sumAmounts(
      toLiveLines(transaction).filter(isReadyToAssignIncome),
    );

    return amount > 0 ? [{ ...transaction, amount }] : [];
  });
  const hasSyncedMonthIncome = months.some((month) => month.income !== 0);
  const syncedIncomeByMonth = new Map(
    months.map((month) => [month.month, month.income] as const),
  );
  const incomeByMonth = new Map(
    months.map((month) => [
      month.month,
      hasSyncedMonthIncome ? (syncedIncomeByMonth.get(month.month) ?? 0) : 0,
    ]),
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

    if (!hasSyncedMonthIncome) {
      incomeByMonth.set(
        month,
        (incomeByMonth.get(month) ?? 0) + transaction.amount,
      );
    }

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
  const incomeTotal = monthTotals.reduce((sum, entry) => sum + entry.income, 0);
  // An in-progress month's partial income would drag the statistics down.
  const firstIncompleteMonth = currentCalendarMonth(input);
  const completedMonthTotals = monthTotals.filter(
    (entry) => entry.month < firstIncompleteMonth,
  );
  const incomeValues = (
    completedMonthTotals.length > 0 ? completedMonthTotals : monthTotals
  ).map((entry) => entry.income);
  const averageIncome = incomeValues.length
    ? incomeValues.reduce((sum, value) => sum + value, 0) / incomeValues.length
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

  if (intervals.every((interval) => interval >= 25 && interval <= 35)) {
    return "monthly";
  }

  return undefined;
}

function hasStableRecurringAmounts(amounts: number[]) {
  if (amounts.length < 3) {
    return false;
  }

  const averageAmount = average(amounts);
  const maxDeviation = Math.max(
    ...amounts.map((amount) => Math.abs(amount - averageAmount)),
  );

  return averageAmount > 0 && maxDeviation / averageAmount <= 0.5;
}

export async function getRecurringExpenseSummary(
  ynabClient: YnabClient,
  input: { planId?: string; fromDate: string; toDate: string; topN?: number },
) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const topN = resolveTopN(input);
  const [transactions, offBudgetAccountIds] = await Promise.all([
    ynabClient.listTransactions(planId, input.fromDate, input.toDate),
    listOffBudgetAccountIds(ynabClient, planId),
  ]);
  const candidates = new Map<
    string,
    {
      payeeId?: string | null;
      payeeName: string;
      dates: string[];
      amounts: number[];
    }
  >();

  for (const transaction of toBudgetTransactions(
    transactions,
    offBudgetAccountIds,
    toMonthKey(input.fromDate),
    toMonthKey(input.toDate),
  )) {
    if (
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
      if (!cadence || !hasStableRecurringAmounts(candidate.amounts)) {
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

export async function getBudgetCleanupSummary(
  ynabClient: YnabClient,
  input: FinancialHealthInput,
) {
  const topN = resolveTopN(input);
  const { monthDetail, budgetTransactions: monthTransactions } =
    await getMonthTransactionContext(ynabClient, input);
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
  const debtMilliunits = monthAccounts
    .filter(
      (account) => !account.deleted && !account.closed && account.balance < 0,
    )
    .reduce((sum, account) => sum + Math.abs(account.balance), 0);

  return {
    month,
    netWorthMilliunits: snapshot.netWorthMilliunits,
    liquidCashMilliunits: snapshot.liquidCashMilliunits,
    debtMilliunits,
  };
}

export async function getNetWorthTrajectory(
  ynabClient: YnabClient,
  input: {
    planId?: string;
    fromMonth?: string;
    toMonth?: string;
    timeZone?: string;
  },
) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const { fromMonth, toMonth } = await resolveMonthRange(
    ynabClient,
    planId,
    input.fromMonth,
    input.toMonth,
    input,
  );
  const currentMonth = currentCalendarMonth(input);
  const [accounts, transactions] = await Promise.all([
    ynabClient.listAccounts(planId),
    ynabClient.listTransactions(
      planId,
      fromMonth,
      endOfMonth(toMonth > currentMonth ? toMonth : currentMonth),
    ),
  ]);
  const months = listMonthsInRange(fromMonth, toMonth);
  // YNAB only closes zero-balance accounts, so a closed account holds nothing
  // today but still held its rolled-back balance in earlier months.
  const historicalAccounts = accounts
    .filter((account) => !account.deleted)
    .map((account) =>
      account.closed ? { ...account, balance: 0, closed: false } : account,
    );
  const balancesByMonth = reconstructHistoricalBalances(
    historicalAccounts,
    transactions,
    months,
  );
  const monthSummaries = months.map((month) =>
    summarizeBalances(
      month,
      balancesByMonth.get(month) ?? new Map(),
      historicalAccounts,
    ),
  );
  const startSummary = monthSummaries[0];
  const endSummary = monthSummaries[monthSummaries.length - 1];
  const startNetWorthMilliunits = startSummary?.netWorthMilliunits ?? 0;
  const endNetWorthMilliunits = endSummary?.netWorthMilliunits ?? 0;

  return {
    from_month: fromMonth,
    to_month: toMonth,
    start_net_worth: formatMilliunits(startNetWorthMilliunits),
    end_net_worth: formatMilliunits(endNetWorthMilliunits),
    change_net_worth: formatMilliunits(
      endNetWorthMilliunits - startNetWorthMilliunits,
    ),
    months: monthSummaries.map((summary) => ({
      month: summary.month,
      net_worth: formatMilliunits(summary.netWorthMilliunits),
      liquid_cash: formatMilliunits(summary.liquidCashMilliunits),
      debt: formatMilliunits(summary.debtMilliunits),
    })),
  };
}
