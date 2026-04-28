import type {
  MoneyMovementGroupRow,
  MoneyMovementRow
} from "../../platform/ynab/read-model/money-movements-repository.js";
import { formatAmountMilliunits, paginateEntries, shouldPaginateEntries } from "../../shared/collections.js";
import { compactObject } from "../../shared/object.js";

export type DbMoneyMovementsInput = {
  planId?: string;
  limit?: number;
  offset?: number;
};

export type DbMoneyMovementsByMonthInput = DbMoneyMovementsInput & {
  month: string;
};

type DbMoneyMovementsDependencies = {
  defaultPlanId?: string;
  moneyMovementsRepository: {
    listMoneyMovementGroups(input: { planId: string; month?: string }): Promise<MoneyMovementGroupRow[]>;
    listMoneyMovements(input: { planId: string; month?: string }): Promise<MoneyMovementRow[]>;
  };
};

function resolvePlanId(input: { planId?: string }, defaultPlanId?: string) {
  const planId = input.planId ?? defaultPlanId;

  if (!planId) {
    throw new Error("planId is required when YNAB_DEFAULT_PLAN_ID is not configured.");
  }

  return planId;
}

function toDisplayMoneyMovement(row: MoneyMovementRow) {
  return compactObject({
    id: row.id,
    moved_at: row.moved_at,
    month: row.month,
    note: row.note,
    amount: formatAmountMilliunits(row.amount_milliunits),
    amount_milliunits: row.amount_milliunits,
    from_category_id: row.from_category_id,
    from_category_name: row.from_category_name,
    to_category_id: row.to_category_id,
    to_category_name: row.to_category_name,
    money_movement_group_id: row.money_movement_group_id,
    performed_by_user_id: row.performed_by_user_id
  });
}

function toDisplayMoneyMovementGroup(row: MoneyMovementGroupRow) {
  return compactObject({
    id: row.id,
    group_created_at: row.group_created_at,
    month: row.month,
    note: row.note,
    performed_by_user_id: row.performed_by_user_id,
    movement_count: row.movement_count,
    total_amount: formatAmountMilliunits(row.total_amount_milliunits),
    total_amount_milliunits: row.total_amount_milliunits
  });
}

function buildCollectionResult<TEntry>(
  entries: TEntry[],
  input: DbMoneyMovementsInput,
  entryKey: "money_movements" | "money_movement_groups",
  countKey: "movement_count" | "group_count",
  extra: Record<string, unknown> = {}
) {
  if (!shouldPaginateEntries(entries, input)) {
    return {
      [entryKey]: entries,
      [countKey]: entries.length,
      ...extra
    };
  }

  const pagedEntries = paginateEntries(entries, input);

  return {
    [entryKey]: pagedEntries.entries,
    [countKey]: entries.length,
    ...pagedEntries.metadata,
    ...extra
  };
}

export async function getDbMoneyMovements(
  dependencies: DbMoneyMovementsDependencies,
  input: DbMoneyMovementsInput
) {
  const planId = resolvePlanId(input, dependencies.defaultPlanId);
  const rows = await dependencies.moneyMovementsRepository.listMoneyMovements({ planId });

  return buildCollectionResult(rows.map(toDisplayMoneyMovement), input, "money_movements", "movement_count");
}

export async function getDbMoneyMovementsByMonth(
  dependencies: DbMoneyMovementsDependencies,
  input: DbMoneyMovementsByMonthInput
) {
  const planId = resolvePlanId(input, dependencies.defaultPlanId);
  const rows = await dependencies.moneyMovementsRepository.listMoneyMovements({
    month: input.month,
    planId
  });

  return buildCollectionResult(rows.map(toDisplayMoneyMovement), input, "money_movements", "movement_count", {
    month: input.month
  });
}

export async function getDbMoneyMovementGroups(
  dependencies: DbMoneyMovementsDependencies,
  input: DbMoneyMovementsInput
) {
  const planId = resolvePlanId(input, dependencies.defaultPlanId);
  const rows = await dependencies.moneyMovementsRepository.listMoneyMovementGroups({ planId });

  return buildCollectionResult(
    rows.map(toDisplayMoneyMovementGroup),
    input,
    "money_movement_groups",
    "group_count"
  );
}

export async function getDbMoneyMovementGroupsByMonth(
  dependencies: DbMoneyMovementsDependencies,
  input: DbMoneyMovementsByMonthInput
) {
  const planId = resolvePlanId(input, dependencies.defaultPlanId);
  const rows = await dependencies.moneyMovementsRepository.listMoneyMovementGroups({
    month: input.month,
    planId
  });

  return buildCollectionResult(
    rows.map(toDisplayMoneyMovementGroup),
    input,
    "money_movement_groups",
    "group_count",
    {
      month: input.month
    }
  );
}
