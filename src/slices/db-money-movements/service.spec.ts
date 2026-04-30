import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { DEFAULT_LIMIT } from "../../shared/collections.js";
import { searchDbMoneyMovements } from "./service.js";

const repository = {
  usesServerPagination: true,
  listMoneyMovementGroups: vi.fn(),
  listMoneyMovements: vi.fn(),
};

describe("DB-backed money movement service", () => {
  it("is the only money movement slice because public movement tools are category read-model tools", () => {
    expect(
      existsSync(join(process.cwd(), "src", "slices", "money-movements")),
    ).toBe(false);
  });

  it("lists category money movements from the read model with pagination", async () => {
    repository.listMoneyMovements.mockResolvedValueOnce({
      rows: [
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
          deleted: 0,
        },
      ],
      totalCount: 2,
    });

    await expect(
      searchDbMoneyMovements(
        {
          defaultPlanId: "plan-1",
          moneyMovementsRepository: repository,
        },
        {
          limit: 1,
          offset: 1,
        },
      ),
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
          money_movement_group_id: "group-2",
        },
      ],
      movement_count: 2,
      limit: 1,
      offset: 1,
      returned_count: 1,
      has_more: false,
    });
    expect(repository.listMoneyMovements).toHaveBeenCalledWith({
      limit: 1,
      offset: 1,
      planId: "plan-1",
    });
  });

  it("filters category money movements by month", async () => {
    repository.listMoneyMovements.mockResolvedValueOnce({
      rows: [],
      totalCount: 0,
    });

    await expect(
      searchDbMoneyMovements(
        {
          defaultPlanId: "plan-1",
          moneyMovementsRepository: repository,
        },
        {
          month: "2026-04-01",
        },
      ),
    ).resolves.toEqual({
      money_movements: [],
      movement_count: 0,
      month: "2026-04-01",
    });
    expect(repository.listMoneyMovements).toHaveBeenCalledWith({
      month: "2026-04-01",
      limit: DEFAULT_LIMIT,
      planId: "plan-1",
    });
  });

  it("applies the default page size in the repository for broad searches", async () => {
    repository.listMoneyMovements.mockResolvedValueOnce({
      rows: [
        {
          id: "move-1",
          month: "2026-04-01",
          amount_milliunits: 1000,
          deleted: 0,
        },
      ],
      totalCount: DEFAULT_LIMIT + 1,
    });

    await expect(
      searchDbMoneyMovements(
        {
          defaultPlanId: "plan-1",
          moneyMovementsRepository: repository,
        },
        {},
      ),
    ).resolves.toMatchObject({
      movement_count: DEFAULT_LIMIT + 1,
      limit: DEFAULT_LIMIT,
      offset: 0,
      returned_count: 1,
      has_more: true,
    });
    expect(repository.listMoneyMovements).toHaveBeenCalledWith({
      limit: DEFAULT_LIMIT,
      planId: "plan-1",
    });
  });

  it("honors offset-only money movement searches with the default page size", async () => {
    repository.listMoneyMovements.mockResolvedValueOnce({
      rows: [
        {
          id: "move-2",
          month: "2026-04-01",
          amount_milliunits: 2000,
          deleted: 0,
        },
      ],
      totalCount: 10,
    });

    await expect(
      searchDbMoneyMovements(
        {
          defaultPlanId: "plan-1",
          moneyMovementsRepository: repository,
        },
        {
          offset: 5,
        },
      ),
    ).resolves.toMatchObject({
      movement_count: 10,
      limit: DEFAULT_LIMIT,
      offset: 5,
      returned_count: 1,
      has_more: true,
    });
    expect(repository.listMoneyMovements).toHaveBeenCalledWith({
      limit: DEFAULT_LIMIT,
      offset: 5,
      planId: "plan-1",
    });
  });

  it("pushes money movement range filters into the repository", async () => {
    // DEFECT: range searches can fetch all synced money movements and filter them in slice memory.
    repository.listMoneyMovements.mockResolvedValueOnce([]);

    await searchDbMoneyMovements(
      {
        defaultPlanId: "plan-1",
        moneyMovementsRepository: repository,
      },
      {
        fromMonth: "2026-03-01",
        toMonth: "2026-04-01",
      },
    );

    expect(repository.listMoneyMovements).toHaveBeenCalledWith({
      fromMonth: "2026-03-01",
      limit: DEFAULT_LIMIT,
      planId: "plan-1",
      toMonth: "2026-04-01",
    });
  });

  it("falls back to the default plan when input plan ids are blank", async () => {
    repository.listMoneyMovements.mockResolvedValueOnce({
      rows: [],
      totalCount: 0,
    });

    await searchDbMoneyMovements(
      {
        defaultPlanId: "plan-1",
        moneyMovementsRepository: repository,
      },
      {
        planId: "   ",
      },
    );

    expect(repository.listMoneyMovements).toHaveBeenLastCalledWith({
      limit: DEFAULT_LIMIT,
      planId: "plan-1",
    });
  });

  it("lists stored money movement groups from the read model", async () => {
    repository.listMoneyMovementGroups.mockResolvedValueOnce({
      rows: [
        {
          id: "group-1",
          group_created_at: "2026-04-12T10:00:00.000Z",
          month: "2026-04-01",
          note: "Cover dining",
          performed_by_user_id: "user-1",
          movement_count: 2,
          total_amount_milliunits: 17500,
          deleted: 0,
        },
      ],
      totalCount: 1,
    });

    await expect(
      searchDbMoneyMovements(
        {
          defaultPlanId: "plan-1",
          moneyMovementsRepository: repository,
        },
        { groupBy: "group" },
      ),
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
          total_amount_milliunits: 17500,
        },
      ],
      group_count: 1,
    });
  });

  it("filters stored money movement groups by month", async () => {
    repository.listMoneyMovementGroups.mockResolvedValueOnce({
      rows: [],
      totalCount: 0,
    });

    await expect(
      searchDbMoneyMovements(
        {
          defaultPlanId: "plan-1",
          moneyMovementsRepository: repository,
        },
        {
          groupBy: "group",
          month: "2026-04-01",
        },
      ),
    ).resolves.toEqual({
      money_movement_groups: [],
      group_count: 0,
      month: "2026-04-01",
    });
    expect(repository.listMoneyMovementGroups).toHaveBeenCalledWith({
      month: "2026-04-01",
      limit: DEFAULT_LIMIT,
      planId: "plan-1",
    });
  });
});
