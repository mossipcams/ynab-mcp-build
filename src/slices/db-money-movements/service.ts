import type {
  MoneyMovementGroupRow,
  MoneyMovementRow,
} from "../../platform/ynab/read-model/money-movements-repository.js";
import {
  formatAmountMilliunits,
  paginateEntries,
  shouldPaginateEntries,
} from "../../shared/collections.js";
import { compactObject } from "../../shared/object.js";

export type DbMoneyMovementsInput = {
  planId?: string;
  month?: string;
  fromMonth?: string;
  toMonth?: string;
  groupBy?: "movement" | "group";
  limit?: number;
  offset?: number;
};

type DbMoneyMovementsDependencies = {
  defaultPlanId?: string;
  moneyMovementsRepository: {
    listMoneyMovementGroups(input: {
      planId: string;
      month?: string;
    }): Promise<MoneyMovementGroupRow[]>;
    listMoneyMovements(input: {
      planId: string;
      month?: string;
    }): Promise<MoneyMovementRow[]>;
  };
};

function resolvePlanId(input: { planId?: string }, defaultPlanId?: string) {
  const inputPlanId = input.planId?.trim();

  if (inputPlanId) {
    return inputPlanId;
  }

  const planId = defaultPlanId?.trim();

  if (!planId) {
    throw new Error(
      "planId is required when YNAB_DEFAULT_PLAN_ID is not configured.",
    );
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
    performed_by_user_id: row.performed_by_user_id,
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
    total_amount_milliunits: row.total_amount_milliunits,
  });
}

function matchesMonthRange(
  month: string | null | undefined,
  input: Pick<DbMoneyMovementsInput, "fromMonth" | "month" | "toMonth">,
) {
  if (!month) {
    return false;
  }

  if (input.month) {
    return month === input.month;
  }

  return (
    (!input.fromMonth || month >= input.fromMonth) &&
    (!input.toMonth || month <= input.toMonth)
  );
}

function buildCollectionResult<TEntry>(
  entries: TEntry[],
  input: DbMoneyMovementsInput,
  entryKey: "money_movements" | "money_movement_groups",
  countKey: "movement_count" | "group_count",
  extra: Record<string, unknown> = {},
) {
  if (!shouldPaginateEntries(entries, input)) {
    return {
      [entryKey]: entries,
      [countKey]: entries.length,
      ...extra,
    };
  }

  const pagedEntries = paginateEntries(entries, input);

  return {
    [entryKey]: pagedEntries.entries,
    [countKey]: entries.length,
    ...pagedEntries.metadata,
    ...extra,
  };
}

export async function searchDbMoneyMovements(
  dependencies: DbMoneyMovementsDependencies,
  input: DbMoneyMovementsInput,
) {
  const planId = resolvePlanId(input, dependencies.defaultPlanId);
  const groupBy = input.groupBy ?? "movement";
  const month = input.month;
  const filters = compactObject({
    month: input.month,
    from_month: input.fromMonth,
    to_month: input.toMonth,
  });
  const extra = Object.keys(filters).length ? filters : {};

  if (groupBy === "group") {
    const rows = (
      await dependencies.moneyMovementsRepository.listMoneyMovementGroups({
        ...(month ? { month } : {}),
        planId,
      })
    ).filter((row) => matchesMonthRange(row.month, input));

    return buildCollectionResult(
      rows.map(toDisplayMoneyMovementGroup),
      input,
      "money_movement_groups",
      "group_count",
      extra,
    );
  }

  const rows = (
    await dependencies.moneyMovementsRepository.listMoneyMovements({
      ...(month ? { month } : {}),
      planId,
    })
  ).filter((row) => matchesMonthRange(row.month, input));

  return buildCollectionResult(
    rows.map(toDisplayMoneyMovement),
    input,
    "money_movements",
    "movement_count",
    extra,
  );
}
