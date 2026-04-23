import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { listCategories, listPlanMonths } from "../../../src/slices/plans/service.js";
import { getPlanToolDefinitions } from "../../../src/slices/plans/tools.js";

describe("plans service", () => {
  it("filters hidden and deleted category groups and categories from visible category output", async () => {
    // DEFECT: hidden or deleted categories can leak into the public plan-category view and confuse clients that expect visible choices only.
    const ynabClient = {
      listCategories: vi.fn().mockResolvedValue([
        {
          id: "group-visible",
          name: "Immediate Obligations",
          hidden: false,
          deleted: false,
          categories: [
            {
              id: "category-visible",
              name: "Rent",
              hidden: false,
              deleted: false
            },
            {
              id: "category-hidden",
              name: "Internal",
              hidden: true,
              deleted: false
            }
          ]
        },
        {
          id: "group-hidden",
          name: "Archived",
          hidden: true,
          deleted: false,
          categories: []
        }
      ])
    };

    await expect(listCategories(ynabClient as never, "plan-1")).resolves.toEqual({
      category_groups: [
        {
          id: "group-visible",
          name: "Immediate Obligations",
          categories: [
            {
              id: "category-visible",
              name: "Rent"
            }
          ]
        }
      ],
      category_group_count: 1
    });
  });

  it("filters deleted months from plan month listings", async () => {
    // DEFECT: deleted plan months can reappear in month listings and break clients that expect an active-month timeline only.
    const ynabClient = {
      listPlanMonths: vi.fn().mockResolvedValue([
        {
          month: "2026-04-01",
          income: 1000,
          budgeted: 800,
          activity: -500,
          toBeBudgeted: 200,
          deleted: false
        },
        {
          month: "2026-03-01",
          income: 900,
          budgeted: 700,
          activity: -450,
          toBeBudgeted: 150,
          deleted: true
        }
      ])
    };

    await expect(listPlanMonths(ynabClient as never, "plan-1")).resolves.toEqual({
      months: [
        {
          month: "2026-04-01",
          income: 1000,
          budgeted: 800,
          activity: -500,
          to_be_budgeted: 200
        }
      ],
      month_count: 1
    });
  });

  it("requires month and planId in the plan-month tool schema", () => {
    // DEFECT: the plan-month tool contract can stop requiring its key identifiers and accept ambiguous requests.
    const ynabClient = {
      getCategory: vi.fn(),
      getMonthCategory: vi.fn(),
      getPlan: vi.fn(),
      getPlanMonth: vi.fn(),
      getPlanSettings: vi.fn(),
      listCategories: vi.fn(),
      listPlanMonths: vi.fn(),
      listPlans: vi.fn()
    };
    const definitions = getPlanToolDefinitions(ynabClient as never);
    const monthTool = definitions.find((definition) => definition.name === "ynab_get_plan_month");

    expect(monthTool).toBeDefined();
    expect(() => z.object(monthTool?.inputSchema ?? {}).parse({ planId: "plan-1" })).toThrow();
    expect(() => z.object(monthTool?.inputSchema ?? {}).parse({ month: "2026-04-01" })).toThrow();
  });
});
