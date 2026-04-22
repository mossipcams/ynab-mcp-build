import type { YnabAccountSummary, YnabClient, YnabTransaction } from "../../platform/ynab/client.js";
import { formatAmountMilliunits } from "../../shared/collections.js";
import { compactObject } from "../../shared/object.js";
import { resolvePlanId } from "../../shared/plans.js";

export type GetMoneyMovementsInput = {
  planId?: string;
};

export type GetMoneyMovementsByMonthInput = {
  planId?: string;
  month: string;
};

type DisplayMoneyMovement = {
  id: string;
  date: string;
  amount: string;
  from_account_id?: string | null;
  from_account_name?: string | null;
  to_account_id?: string | null;
  to_account_name?: string | null;
  payee_name?: string | null;
};

type DisplayMoneyMovementGroup = {
  id: string;
  from_account_id?: string | null;
  from_account_name?: string | null;
  to_account_id?: string | null;
  to_account_name?: string | null;
  total_amount: string;
  movement_count: number;
  latest_date: string;
};

function buildAccountNameLookup(accounts: YnabAccountSummary[]) {
  return new Map(
    accounts
      .filter((account) => !account.deleted)
      .map((account) => [account.id, account.name] as const)
  );
}

function isMoneyMovement(transaction: YnabTransaction) {
  return !transaction.deleted && !!transaction.transferAccountId && transaction.amount < 0;
}

function withinMonth(transaction: YnabTransaction, month: string) {
  return transaction.date.startsWith(month.slice(0, 7));
}

function toDisplayMoneyMovement(
  transaction: YnabTransaction,
  accountNames: Map<string, string>
): DisplayMoneyMovement {
  return compactObject({
    id: transaction.id,
    date: transaction.date,
    amount: formatAmountMilliunits(Math.abs(transaction.amount)),
    from_account_id: transaction.accountId,
    from_account_name: transaction.accountName,
    to_account_id: transaction.transferAccountId,
    to_account_name: transaction.transferAccountId ? accountNames.get(transaction.transferAccountId) : undefined,
    payee_name: transaction.payeeName
  }) as DisplayMoneyMovement;
}

function compareMoneyMovements(left: DisplayMoneyMovement, right: DisplayMoneyMovement) {
  return right.date.localeCompare(left.date) || left.id.localeCompare(right.id);
}

function compareMoneyMovementGroups(left: DisplayMoneyMovementGroup, right: DisplayMoneyMovementGroup) {
  const totalDifference = Number(right.total_amount) - Number(left.total_amount);
  if (totalDifference !== 0) {
    return totalDifference;
  }

  return (
    right.latest_date.localeCompare(left.latest_date)
    || (left.from_account_name ?? "").localeCompare(right.from_account_name ?? "")
    || (left.to_account_name ?? "").localeCompare(right.to_account_name ?? "")
  );
}

async function getDisplayMoneyMovements(
  ynabClient: YnabClient,
  planId: string,
  month?: string
) {
  const [accounts, transactions] = await Promise.all([
    ynabClient.listAccounts(planId),
    ynabClient.listTransactions(planId, month)
  ]);
  const accountNames = buildAccountNameLookup(accounts);

  return transactions
    .filter(isMoneyMovement)
    .filter((transaction) => !month || withinMonth(transaction, month))
    .map((transaction) => toDisplayMoneyMovement(transaction, accountNames))
    .sort(compareMoneyMovements);
}

function groupMoneyMovements(movements: DisplayMoneyMovement[]) {
  const groups = new Map<string, Omit<DisplayMoneyMovementGroup, "total_amount"> & { totalAmountMilliunits: number }>();

  for (const movement of movements) {
    const groupId = `${movement.from_account_id ?? movement.from_account_name ?? "unknown"}:${movement.to_account_id ?? movement.to_account_name ?? "unknown"}`;
    const amountMilliunits = Math.round(Number(movement.amount) * 1000);
    const existingGroup = groups.get(groupId);

    if (existingGroup) {
      existingGroup.totalAmountMilliunits += amountMilliunits;
      existingGroup.movement_count += 1;
      if (movement.date > existingGroup.latest_date) {
        existingGroup.latest_date = movement.date;
      }
      continue;
    }

    groups.set(groupId, {
      id: groupId,
      from_account_id: movement.from_account_id,
      from_account_name: movement.from_account_name,
      to_account_id: movement.to_account_id,
      to_account_name: movement.to_account_name,
      movement_count: 1,
      latest_date: movement.date,
      totalAmountMilliunits: amountMilliunits
    });
  }

  return Array.from(groups.values())
    .map((group) =>
      compactObject({
        id: group.id,
        from_account_id: group.from_account_id,
        from_account_name: group.from_account_name,
        to_account_id: group.to_account_id,
        to_account_name: group.to_account_name,
        total_amount: formatAmountMilliunits(group.totalAmountMilliunits),
        movement_count: group.movement_count,
        latest_date: group.latest_date
      }) as DisplayMoneyMovementGroup
    )
    .sort(compareMoneyMovementGroups);
}

export async function getMoneyMovements(ynabClient: YnabClient, input: GetMoneyMovementsInput) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const movements = await getDisplayMoneyMovements(ynabClient, planId);

  return {
    money_movements: movements,
    movement_count: movements.length
  };
}

export async function getMoneyMovementsByMonth(ynabClient: YnabClient, input: GetMoneyMovementsByMonthInput) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const movements = await getDisplayMoneyMovements(ynabClient, planId, input.month);

  return {
    month: input.month,
    money_movements: movements,
    movement_count: movements.length
  };
}

export async function getMoneyMovementGroups(ynabClient: YnabClient, input: GetMoneyMovementsInput) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const movementGroups = groupMoneyMovements(await getDisplayMoneyMovements(ynabClient, planId));

  return {
    money_movement_groups: movementGroups,
    group_count: movementGroups.length
  };
}

export async function getMoneyMovementGroupsByMonth(ynabClient: YnabClient, input: GetMoneyMovementsByMonthInput) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const movementGroups = groupMoneyMovements(await getDisplayMoneyMovements(ynabClient, planId, input.month));

  return {
    month: input.month,
    money_movement_groups: movementGroups,
    group_count: movementGroups.length
  };
}
