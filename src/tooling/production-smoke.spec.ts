import { describe, expect, it, vi } from "vitest";

import { executeProductionSmoke } from "./production-smoke.js";

describe("production smoke tooling", () => {
  it("fails clearly when smoke URL or month config is missing", async () => {
    const callTool = vi.fn();

    await expect(
      executeProductionSmoke({
        args: [],
        client: { callTool },
        env: {},
      }),
    ).rejects.toThrow(
      "Production smoke requires MCP_SMOKE_URL or MCP_PUBLIC_URL, and MCP_SMOKE_MONTH or --month.",
    );

    expect(callTool).not.toHaveBeenCalled();
  });

  it("checks spending category detail and false-zero overspent consistency", async () => {
    const callTool = vi.fn(async (name: string) => {
      if (name === "ynab_get_spending_summary") {
        return {
          status: "ok",
          data: {
            top_categories: [
              {
                id: "category-1",
                name: "Groceries",
                amount: "125.00",
              },
            ],
          },
        };
      }

      if (name === "ynab_get_category") {
        return {
          status: "ok",
          data: {
            category: {
              id: "category-1",
              name: "Groceries",
            },
          },
        };
      }

      if (name === "ynab_get_budget_health_summary") {
        return {
          status: "ok",
          data: {
            overspent_total: "0.00",
          },
        };
      }

      return {
        status: "ok",
        data: {
          month: {
            category_count: 7,
          },
        },
      };
    });

    await expect(
      executeProductionSmoke({
        args: [],
        client: { callTool },
        env: {
          MCP_SMOKE_MONTH: "2026-06-01",
          MCP_SMOKE_URL: "https://mcp.example/mcp",
        },
      }),
    ).resolves.toEqual({
      categoryChecked: "category-1",
      month: "2026-06-01",
      monthCategoryCount: 7,
      overspentTotal: "0.00",
      status: "ok",
    });

    expect(callTool).toHaveBeenCalledWith("ynab_get_spending_summary", {
      detailLevel: "detailed",
      fromMonth: "2026-06-01",
      toMonth: "2026-06-01",
      topN: 10,
    });
    expect(callTool).toHaveBeenCalledWith("ynab_get_category", {
      categoryId: "category-1",
      month: "2026-06-01",
    });
    expect(callTool).toHaveBeenCalledWith("ynab_get_budget_health_summary", {
      month: "2026-06-01",
    });
    expect(callTool).toHaveBeenCalledWith("ynab_get_month", {
      month: "2026-06-01",
    });
  });

  it("fails when a zero overspent result has no month categories behind it", async () => {
    const callTool = vi.fn(async (name: string) => {
      if (name === "ynab_get_spending_summary") {
        return {
          status: "ok",
          data: {
            top_categories: [],
          },
        };
      }

      if (name === "ynab_get_budget_health_summary") {
        return {
          status: "ok",
          data: {
            overspent_total: "0.00",
          },
        };
      }

      return {
        status: "ok",
        data: {
          month: {
            category_count: 0,
          },
        },
      };
    });

    await expect(
      executeProductionSmoke({
        args: ["--month", "2026-06-01"],
        client: { callTool },
        env: {
          MCP_SMOKE_URL: "https://mcp.example/mcp",
        },
      }),
    ).rejects.toThrow(
      "Budget health reported zero overspent while month category_count is 0.",
    );
  });
});
