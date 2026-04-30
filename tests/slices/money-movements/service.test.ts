import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { searchDbMoneyMovements } from "../../../src/slices/db-money-movements/service.js";
import { getDbMoneyMovementToolDefinitions } from "../../../src/slices/db-money-movements/tools.js";

describe("money movements service", () => {
  it("returns category money movements from the D1 read model", async () => {
    const repository = {
      listMoneyMovementGroups: vi.fn(),
      listMoneyMovements: vi.fn().mockResolvedValue([
        {
          id: "move-1",
          moved_at: "2026-04-12T10:00:00.000Z",
          month: "2026-04-01",
          note: "Cover dining",
          amount_milliunits: 12500,
          from_category_id: "cat-ready",
          from_category_name: "Ready to Assign",
          to_category_id: "cat-dining",
          to_category_name: "Dining Out",
          money_movement_group_id: "group-1",
          performed_by_user_id: "user-1",
        },
      ]),
    };

    await expect(
      searchDbMoneyMovements(
        {
          defaultPlanId: "plan-1",
          moneyMovementsRepository: repository,
        },
        {},
      ),
    ).resolves.toEqual({
      money_movements: [
        {
          id: "move-1",
          moved_at: "2026-04-12T10:00:00.000Z",
          month: "2026-04-01",
          note: "Cover dining",
          amount: "12.50",
          amount_milliunits: 12500,
          from_category_id: "cat-ready",
          from_category_name: "Ready to Assign",
          to_category_id: "cat-dining",
          to_category_name: "Dining Out",
          money_movement_group_id: "group-1",
          performed_by_user_id: "user-1",
        },
      ],
      movement_count: 1,
    });
    expect(repository.listMoneyMovements).toHaveBeenCalledWith({
      planId: "plan-1",
    });
  });

  it("returns stored movement groups without deriving account transfers", async () => {
    const repository = {
      listMoneyMovementGroups: vi.fn().mockResolvedValue([
        {
          id: "group-1",
          group_created_at: "2026-04-12T10:00:00.000Z",
          month: "2026-04-01",
          note: "Cover dining",
          performed_by_user_id: "user-1",
          movement_count: 2,
          total_amount_milliunits: 17500,
        },
      ]),
      listMoneyMovements: vi.fn(),
    };

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
    expect(repository.listMoneyMovementGroups).toHaveBeenCalledWith({
      planId: "plan-1",
    });
  });

  it("publishes one money movement search schema with optional month and group view", () => {
    const repository = {
      listMoneyMovementGroups: vi.fn(),
      listMoneyMovements: vi.fn(),
    };
    const definitions = getDbMoneyMovementToolDefinitions({
      defaultPlanId: "plan-1",
      moneyMovementsRepository: repository,
    });
    const searchTool = definitions.find(
      (definition) => definition.name === "ynab_search_money_movements",
    );

    expect(searchTool).toBeDefined();
    expect(() =>
      z.object(searchTool?.inputSchema ?? {}).parse({}),
    ).not.toThrow();
    expect(() =>
      z.object(searchTool?.inputSchema ?? {}).parse({
        groupBy: "account_transfer",
      }),
    ).toThrow();
    expect(() =>
      z.object(searchTool?.inputSchema ?? {}).parse({
        groupBy: "group",
        month: "2026-04-01",
      }),
    ).not.toThrow();
  });
});
