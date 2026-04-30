import type {
  ListMoneyMovementsInput,
  MoneyMovementGroupSearchResult,
  MoneyMovementGroupRow,
  MoneyMovementSearchResult,
  MoneyMovementRow,
} from "../../platform/ynab/read-model/money-movements-repository.js";
import {
  DEFAULT_LIMIT,
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
      fromMonth?: string;
      toMonth?: string;
      limit?: number;
      offset?: number;
    }): Promise<MoneyMovementGroupRepositoryResult>;
    listMoneyMovements(input: {
      planId: string;
      month?: string;
      fromMonth?: string;
      toMonth?: string;
      limit?: number;
      offset?: number;
    }): Promise<MoneyMovementRepositoryResult>;
    usesServerPagination?: boolean;
  };
};

type MoneyMovementRepositoryResult =
  | MoneyMovementSearchResult
  | MoneyMovementRow[];

type MoneyMovementGroupRepositoryResult =
  | MoneyMovementGroupSearchResult
  | MoneyMovementGroupRow[];

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
  totalCount: number,
  input: DbMoneyMovementsInput,
  entryKey: "money_movements" | "money_movement_groups",
  countKey: "movement_count" | "group_count",
  options: { useServerPagination: boolean },
  extra: Record<string, unknown> = {},
) {
  if (options.useServerPagination) {
    if (!shouldIncludePaginationMetadata(input, totalCount)) {
      return {
        [entryKey]: entries,
        [countKey]: totalCount,
        ...extra,
      };
    }

    const pagination = getEffectivePagination(input);
    const offset = pagination.offset ?? 0;

    return {
      [entryKey]: entries,
      [countKey]: totalCount,
      limit: pagination.limit,
      offset,
      returned_count: entries.length,
      has_more: offset + entries.length < totalCount,
      ...extra,
    };
  }

  if (!shouldPaginateEntries(entries, input)) {
    return {
      [entryKey]: entries,
      [countKey]: totalCount,
      ...extra,
    };
  }

  const pagedEntries = paginateEntries(entries, input);

  return {
    [entryKey]: pagedEntries.entries,
    [countKey]: totalCount,
    ...pagedEntries.metadata,
    ...extra,
  };
}

function shouldIncludePaginationMetadata(
  input: Pick<DbMoneyMovementsInput, "limit" | "offset">,
  totalCount: number,
) {
  return (
    input.limit !== undefined ||
    input.offset !== undefined ||
    totalCount > DEFAULT_LIMIT
  );
}

function getEffectivePagination(
  input: Pick<DbMoneyMovementsInput, "limit" | "offset">,
) {
  return {
    limit: input.limit ?? DEFAULT_LIMIT,
    ...(input.offset !== undefined ? { offset: input.offset } : {}),
  };
}

function buildRepositoryInput(
  input: DbMoneyMovementsInput,
  planId: string,
  options: { useServerPagination: boolean },
): ListMoneyMovementsInput {
  const repositoryInput: ListMoneyMovementsInput = { planId };

  if (input.month) {
    repositoryInput.month = input.month;
  }

  if (input.fromMonth) {
    repositoryInput.fromMonth = input.fromMonth;
  }

  if (input.toMonth) {
    repositoryInput.toMonth = input.toMonth;
  }

  if (options.useServerPagination) {
    const pagination = getEffectivePagination(input);

    repositoryInput.limit = pagination.limit;

    if (pagination.offset !== undefined) {
      repositoryInput.offset = pagination.offset;
    }

    return repositoryInput;
  }

  if (input.limit !== undefined) {
    repositoryInput.limit = input.limit;
  }

  if (input.offset !== undefined) {
    repositoryInput.offset = input.offset;
  }

  return repositoryInput;
}

function normalizeRepositoryResult<TRow>(
  result: { rows: TRow[]; totalCount: number } | TRow[],
) {
  if (Array.isArray(result)) {
    return {
      rows: result,
      totalCount: result.length,
    };
  }

  return result;
}

function maybeFilterRowsByMonthRange<TRow extends { month?: string | null }>(
  rows: TRow[],
  input: DbMoneyMovementsInput,
  options: { useServerPagination: boolean },
) {
  if (options.useServerPagination) {
    return rows;
  }

  return rows.filter((row) => matchesMonthRange(row.month, input));
}

export async function searchDbMoneyMovements(
  dependencies: DbMoneyMovementsDependencies,
  input: DbMoneyMovementsInput,
) {
  const planId = resolvePlanId(input, dependencies.defaultPlanId);
  const groupBy = input.groupBy ?? "movement";
  const filters = compactObject({
    month: input.month,
    from_month: input.fromMonth,
    to_month: input.toMonth,
  });
  const extra = Object.keys(filters).length ? filters : {};
  const useServerPagination =
    dependencies.moneyMovementsRepository.usesServerPagination === true;
  const repositoryInput = buildRepositoryInput(input, planId, {
    useServerPagination,
  });

  if (groupBy === "group") {
    const result = normalizeRepositoryResult(
      await dependencies.moneyMovementsRepository.listMoneyMovementGroups(
        repositoryInput,
      ),
    );
    const rows = maybeFilterRowsByMonthRange(result.rows, input, {
      useServerPagination,
    });

    return buildCollectionResult(
      rows.map(toDisplayMoneyMovementGroup),
      useServerPagination ? result.totalCount : rows.length,
      input,
      "money_movement_groups",
      "group_count",
      { useServerPagination },
      extra,
    );
  }

  const result = normalizeRepositoryResult(
    await dependencies.moneyMovementsRepository.listMoneyMovements(
      repositoryInput,
    ),
  );
  const rows = maybeFilterRowsByMonthRange(result.rows, input, {
    useServerPagination,
  });

  return buildCollectionResult(
    rows.map(toDisplayMoneyMovement),
    useServerPagination ? result.totalCount : rows.length,
    input,
    "money_movements",
    "movement_count",
    { useServerPagination },
    extra,
  );
}
