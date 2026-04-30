export type MoneyMovementRow = {
  id: string;
  month?: string | null;
  moved_at?: string | null;
  note?: string | null;
  money_movement_group_id?: string | null;
  performed_by_user_id?: string | null;
  from_category_id?: string | null;
  from_category_name?: string | null;
  to_category_id?: string | null;
  to_category_name?: string | null;
  amount_milliunits: number;
  deleted: number;
};

export type MoneyMovementGroupRow = {
  id: string;
  group_created_at: string;
  month: string;
  note?: string | null;
  performed_by_user_id?: string | null;
  movement_count: number;
  total_amount_milliunits: number;
  deleted: number;
};

export type ListMoneyMovementsInput = {
  planId: string;
  month?: string;
  fromMonth?: string;
  toMonth?: string;
  limit?: number;
  offset?: number;
};

export type MoneyMovementSearchResult = {
  rows: MoneyMovementRow[];
  totalCount: number;
};

export type MoneyMovementGroupSearchResult = {
  rows: MoneyMovementGroupRow[];
  totalCount: number;
};

type CountRow = {
  count: number;
};

const rowsOrEmpty = <T>(result: { results?: T[] }) => result.results ?? [];

function appendMonthFilters(
  where: string[],
  params: Array<number | string>,
  columnName: string,
  input: Pick<ListMoneyMovementsInput, "fromMonth" | "month" | "toMonth">,
) {
  if (input.month) {
    where.push(`${columnName} = ?`);
    params.push(input.month);

    return;
  }

  if (input.fromMonth) {
    where.push(`${columnName} >= ?`);
    params.push(input.fromMonth);
  }

  if (input.toMonth) {
    where.push(`${columnName} <= ?`);
    params.push(input.toMonth);
  }
}

function buildLimitSql(
  input: Pick<ListMoneyMovementsInput, "limit" | "offset">,
) {
  if (input.limit === undefined) {
    return {
      params: [],
      sql: "",
    };
  }

  return {
    params: [input.limit, input.offset ?? 0],
    sql: "LIMIT ? OFFSET ?",
  };
}

export function createMoneyMovementsRepository(database: D1Database) {
  return {
    usesServerPagination: true,

    async listMoneyMovements(
      input: ListMoneyMovementsInput,
    ): Promise<MoneyMovementSearchResult> {
      const where = ["movement.plan_id = ?", "movement.deleted = 0"];
      const params: Array<number | string> = [input.planId];
      appendMonthFilters(where, params, "movement.month", input);
      const limit = buildLimitSql(input);

      const result = await database
        .prepare(
          `SELECT movement.id,
                  movement.month,
                  movement.moved_at,
                  movement.note,
                  movement.money_movement_group_id,
                  movement.performed_by_user_id,
                  movement.from_category_id,
                  from_category.name AS from_category_name,
                  movement.to_category_id,
                  to_category.name AS to_category_name,
                  movement.amount_milliunits,
                  movement.deleted
           FROM ynab_money_movements movement
           LEFT JOIN ynab_categories from_category
             ON from_category.plan_id = movement.plan_id
            AND from_category.id = movement.from_category_id
           LEFT JOIN ynab_categories to_category
             ON to_category.plan_id = movement.plan_id
            AND to_category.id = movement.to_category_id
           WHERE ${where.join(" AND ")}
           ORDER BY movement.moved_at DESC, movement.id
           ${limit.sql}`,
        )
        .bind(...params, ...limit.params)
        .all<MoneyMovementRow>();
      const countResult = await database
        .prepare(
          `SELECT COUNT(*) AS count FROM ynab_money_movements movement
           WHERE ${where.join(" AND ")}`,
        )
        .bind(...params)
        .all<CountRow>();

      return {
        rows: rowsOrEmpty(result),
        totalCount: rowsOrEmpty(countResult)[0]?.count ?? 0,
      };
    },

    async listMoneyMovementGroups(
      input: ListMoneyMovementsInput,
    ): Promise<MoneyMovementGroupSearchResult> {
      const where = [
        "movement_group.plan_id = ?",
        "movement_group.deleted = 0",
      ];
      const params: Array<number | string> = [input.planId];
      appendMonthFilters(where, params, "movement_group.month", input);
      const limit = buildLimitSql(input);

      const result = await database
        .prepare(
          `SELECT movement_group.id,
                  movement_group.group_created_at,
                  movement_group.month,
                  movement_group.note,
                  movement_group.performed_by_user_id,
                  COUNT(movement.id) AS movement_count,
                  COALESCE(SUM(movement.amount_milliunits), 0) AS total_amount_milliunits,
                  movement_group.deleted
           FROM ynab_money_movement_groups movement_group
           LEFT JOIN ynab_money_movements movement
             ON movement.plan_id = movement_group.plan_id
            AND movement.money_movement_group_id = movement_group.id
            AND movement.deleted = 0
           WHERE ${where.join(" AND ")}
           GROUP BY movement_group.plan_id, movement_group.id
           ORDER BY movement_group.group_created_at DESC, movement_group.id
           ${limit.sql}`,
        )
        .bind(...params, ...limit.params)
        .all<MoneyMovementGroupRow>();
      const countResult = await database
        .prepare(
          `SELECT COUNT(*) AS count FROM ynab_money_movement_groups movement_group
           WHERE ${where.join(" AND ")}`,
        )
        .bind(...params)
        .all<CountRow>();

      return {
        rows: rowsOrEmpty(result),
        totalCount: rowsOrEmpty(countResult)[0]?.count ?? 0,
      };
    },
  };
}
