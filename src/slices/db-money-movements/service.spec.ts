import { describe, expect, it, vi } from "vitest";

import {
  getDbMoneyMovementGroups,
  getDbMoneyMovementGroupsByMonth,
  getDbMoneyMovements,
  getDbMoneyMovementsByMonth
} from "./service.js";

const repository = {
  listMoneyMovementGroups: vi.fn(),
  listMoneyMovements: vi.fn()
};

describe("DB-backed money movement service", () => {
  it("lists category money movements from the read model with pagination", async () => {
    repository.listMoneyMovements.mockResolvedValueOnce([
      {
        id: "move-1",
        moved_at: "2026-04-12T10:00:00.000Z",
        month: "2026-04-01",
        note: "Cover dining",
        money_movement_group_id: "group-1",
        performed_by_user_id: "user-1",
        from_category_id: "cat-ready",
        from_category_name: "Ready to Assign",
        to_category_id: "cat-dining",
        to_category_name: "Dining Out",
        amount_milliunits: 12500,
        deleted: 0
      },
      {
        id: "move-2",
        moved_at: "2026-04-10T10:00:00.000Z",
        month: "2026-04-01",
        note: null,
        money_movement_group_id: "group-2",
        performed_by_user_id: null,
        from_category_id: "cat-fun",
        from_category_name: "Fun Money",
        to_category_id: "cat-groceries",
        to_category_name: "Groceries",
        amount_milliunits: 5000,
        deleted: 0
      }
    ]);

    await expect(
      getDbMoneyMovements(
        {
          defaultPlanId: "plan-1",
          moneyMovementsRepository: repository
        },
        {
          limit: 1,
          offset: 1
        }
      )
    ).resolves.toEqual({
      money_movements: [
        {
          id: "move-2",
          moved_at: "2026-04-10T10:00:00.000Z",
          month: "2026-04-01",
          amount: "5.00",
          amount_milliunits: 5000,
          from_category_id: "cat-fun",
          from_category_name: "Fun Money",
          to_category_id: "cat-groceries",
          to_category_name: "Groceries",
          money_movement_group_id: "group-2"
        }
      ],
      movement_count: 2,
      limit: 1,
      offset: 1,
      returned_count: 1,
      has_more: false
    });
    expect(repository.listMoneyMovements).toHaveBeenCalledWith({
      planId: "plan-1"
    });
  });

  it("filters category money movements by month", async () => {
    repository.listMoneyMovements.mockResolvedValueOnce([]);

    await expect(
      getDbMoneyMovementsByMonth(
        {
          defaultPlanId: "plan-1",
          moneyMovementsRepository: repository
        },
        {
          month: "2026-04-01"
        }
      )
    ).resolves.toEqual({
      money_movements: [],
      movement_count: 0,
      month: "2026-04-01"
    });
    expect(repository.listMoneyMovements).toHaveBeenCalledWith({
      month: "2026-04-01",
      planId: "plan-1"
    });
  });

  it("lists stored money movement groups from the read model", async () => {
    repository.listMoneyMovementGroups.mockResolvedValueOnce([
      {
        id: "group-1",
        group_created_at: "2026-04-12T10:00:00.000Z",
        month: "2026-04-01",
        note: "Cover dining",
        performed_by_user_id: "user-1",
        movement_count: 2,
        total_amount_milliunits: 17500,
        deleted: 0
      }
    ]);

    await expect(
      getDbMoneyMovementGroups(
        {
          defaultPlanId: "plan-1",
          moneyMovementsRepository: repository
        },
        {}
      )
    ).resolves.toEqual({
      money_movement_groups: [
        {
          id: "group-1",
          group_created_at: "2026-04-12T10:00:00.000Z",
          month: "2026-04-01",
          note: "Cover dining",
          performed_by_user_id: "user-1",
          movement_count: 2,
          total_amount: "17.50",
          total_amount_milliunits: 17500
        }
      ],
      group_count: 1
    });
  });

  it("filters stored money movement groups by month", async () => {
    repository.listMoneyMovementGroups.mockResolvedValueOnce([]);

    await expect(
      getDbMoneyMovementGroupsByMonth(
        {
          defaultPlanId: "plan-1",
          moneyMovementsRepository: repository
        },
        {
          month: "2026-04-01"
        }
      )
    ).resolves.toEqual({
      money_movement_groups: [],
      group_count: 0,
      month: "2026-04-01"
    });
    expect(repository.listMoneyMovementGroups).toHaveBeenCalledWith({
      month: "2026-04-01",
      planId: "plan-1"
    });
  });
});
