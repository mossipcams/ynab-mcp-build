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
};

const rowsOrEmpty = <T>(result: { results?: T[] }) => result.results ?? [];

export function createMoneyMovementsRepository(database: D1Database) {
  return {
    async listMoneyMovements(input: ListMoneyMovementsInput) {
      const where = ["movement.plan_id = ?", "movement.deleted = 0"];
      const params: string[] = [input.planId];

      if (input.month) {
        where.push("movement.month = ?");
        params.push(input.month);
      } else {
        if (input.fromMonth) {
          where.push("movement.month >= ?");
          params.push(input.fromMonth);
        }

        if (input.toMonth) {
          where.push("movement.month <= ?");
          params.push(input.toMonth);
        }
      }

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
           ORDER BY movement.moved_at DESC, movement.id`,
        )
        .bind(...params)
        .all<MoneyMovementRow>();

      return rowsOrEmpty(result);
    },

    async listMoneyMovementGroups(input: ListMoneyMovementsInput) {
      const where = ["movement.plan_id = ?", "movement.deleted = 0"];
      const params: string[] = [input.planId];

      if (input.month) {
        where.push("movement.month = ?");
        params.push(input.month);
      } else {
        if (input.fromMonth) {
          where.push("movement.month >= ?");
          params.push(input.fromMonth);
        }

        if (input.toMonth) {
          where.push("movement.month <= ?");
          params.push(input.toMonth);
        }
      }

      const result = await database
        .prepare(
          `SELECT COALESCE(movement.money_movement_group_id, movement.id) AS id,
                  COALESCE(movement_group.group_created_at, MAX(movement.moved_at)) AS group_created_at,
                  COALESCE(movement_group.month, movement.month) AS month,
                  movement_group.note,
                  COALESCE(movement_group.performed_by_user_id, movement.performed_by_user_id) AS performed_by_user_id,
                  COUNT(movement.id) AS movement_count,
                  COALESCE(SUM(movement.amount_milliunits), 0) AS total_amount_milliunits,
                  COALESCE(movement_group.deleted, 0) AS deleted
           FROM ynab_money_movements movement
           LEFT JOIN ynab_money_movement_groups movement_group
             ON movement_group.plan_id = movement.plan_id
            AND movement_group.id = movement.money_movement_group_id
            AND movement_group.deleted = 0
           WHERE ${where.join(" AND ")}
           GROUP BY movement.plan_id, COALESCE(movement.money_movement_group_id, movement.id)
           ORDER BY group_created_at DESC, id`,
        )
        .bind(...params)
        .all<MoneyMovementGroupRow>();

      return rowsOrEmpty(result);
    },
  };
}
