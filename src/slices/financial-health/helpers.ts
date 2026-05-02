type AccountLike = {
  id?: string;
  name?: string;
  type?: string;
  balance?: number;
  deleted?: boolean;
  closed?: boolean;
  onBudget?: boolean;
};

type CategoryLike = {
  id: string;
  name: string;
  balance: number;
  hidden?: boolean;
  deleted?: boolean;
  goalUnderFunded?: number | null;
  categoryGroupName?: string;
};

const trackingAccountTypes = new Set([
  "autoLoan",
  "mortgage",
  "otherAsset",
  "otherLiability",
  "studentLoan",
]);

function isInternalCategory(category: CategoryLike) {
  return (
    category.categoryGroupName === "Internal Master Category" ||
    category.name === "Inflow: Ready to Assign" ||
    category.name === "Uncategorized"
  );
}

function isSpendableCashAccount(account: AccountLike) {
  return (
    account.onBudget !== false ||
    account.type === undefined ||
    !trackingAccountTypes.has(account.type)
  );
}

export function formatMilliunits(value: number) {
  const cents = Math.sign(value) * Math.round(Math.abs(value) / 10);
  const absoluteCents = Math.abs(cents);
  const dollars = Math.trunc(absoluteCents / 100);
  const remainingCents = String(absoluteCents % 100).padStart(2, "0");

  return `${cents < 0 ? "-" : ""}${dollars}.${remainingCents}`;
}

export function toSpentMilliunits(activityMilliunits: number) {
  return activityMilliunits < 0 ? Math.abs(activityMilliunits) : 0;
}

export function buildAssignedSpentSummary(
  assignedMilliunits: number,
  spentMilliunits: number,
) {
  return {
    assigned: formatMilliunits(assignedMilliunits),
    spent: formatMilliunits(spentMilliunits),
    assigned_vs_spent: formatMilliunits(assignedMilliunits - spentMilliunits),
  };
}

export function buildAccountSnapshotSummary<TAccount extends AccountLike>(
  accounts: TAccount[],
) {
  const activeAccounts = accounts.filter(
    (account) => !account.deleted && !account.closed,
  );
  const positiveAccounts = activeAccounts.filter(
    (account) => (account.balance ?? 0) >= 0,
  );
  const positiveOnBudgetAccounts = positiveAccounts.filter((account) =>
    isSpendableCashAccount(account),
  );
  const negativeAccounts = activeAccounts.filter(
    (account) => (account.balance ?? 0) < 0,
  );

  return {
    activeAccounts,
    positiveAccounts,
    negativeAccounts,
    netWorthMilliunits: activeAccounts.reduce(
      (sum, account) => sum + (account.balance ?? 0),
      0,
    ),
    liquidCashMilliunits: positiveOnBudgetAccounts.reduce(
      (sum, account) => sum + (account.balance ?? 0),
      0,
    ),
    onBudgetAccountCount: activeAccounts.filter(
      (account) => account.onBudget !== false,
    ).length,
  };
}

export function buildVisibleCategoryHealthSummary<
  TCategory extends CategoryLike,
>(categories: TCategory[]) {
  const visibleCategories = categories.filter(
    (category) =>
      !category.deleted && !category.hidden && !isInternalCategory(category),
  );

  return {
    availableTotalMilliunits: visibleCategories
      .filter((category) => category.balance > 0)
      .reduce((sum, category) => sum + category.balance, 0),
    overspentCategories: visibleCategories.filter(
      (category) => category.balance < 0,
    ),
    underfundedCategories: visibleCategories.filter(
      (category) => (category.goalUnderFunded ?? 0) > 0,
    ),
  };
}
