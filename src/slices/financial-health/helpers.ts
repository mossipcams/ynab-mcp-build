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

export function formatMilliunits(value: number) {
  return (value / 1000).toFixed(2);
}

export function toSpentMilliunits(activityMilliunits: number) {
  return activityMilliunits < 0 ? Math.abs(activityMilliunits) : 0;
}

export function buildAssignedSpentSummary(assignedMilliunits: number, spentMilliunits: number) {
  return {
    assigned: formatMilliunits(assignedMilliunits),
    spent: formatMilliunits(spentMilliunits),
    assigned_vs_spent: formatMilliunits(assignedMilliunits - spentMilliunits)
  };
}

export function buildAccountSnapshotSummary<TAccount extends AccountLike>(accounts: TAccount[]) {
  const activeAccounts = accounts.filter((account) => !account.deleted && !account.closed);
  const positiveAccounts = activeAccounts.filter((account) => (account.balance ?? 0) >= 0);
  const negativeAccounts = activeAccounts.filter((account) => (account.balance ?? 0) < 0);

  return {
    activeAccounts,
    positiveAccounts,
    negativeAccounts,
    netWorthMilliunits: activeAccounts.reduce((sum, account) => sum + (account.balance ?? 0), 0),
    liquidCashMilliunits: positiveAccounts.reduce((sum, account) => sum + (account.balance ?? 0), 0),
    onBudgetAccountCount: activeAccounts.filter((account) => account.onBudget !== false).length
  };
}

export function buildVisibleCategoryHealthSummary<TCategory extends CategoryLike>(categories: TCategory[]) {
  const visibleCategories = categories.filter((category) => !category.deleted && !category.hidden);

  return {
    availableTotalMilliunits: visibleCategories
      .filter((category) => category.balance > 0)
      .reduce((sum, category) => sum + category.balance, 0),
    overspentCategories: visibleCategories.filter((category) => category.balance < 0),
    underfundedCategories: visibleCategories.filter((category) => (category.goalUnderFunded ?? 0) > 0)
  };
}
