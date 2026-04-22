import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { YnabClient } from "../../platform/ynab/client.js";
import { toErrorResult, toTextResult } from "../../shared/results.js";
import {
  getCategory,
  getMonthCategory,
  getPlan,
  getPlanMonth,
  getPlanSettings,
  listCategories,
  listPlanMonths,
  listPlans
} from "./service.js";

export function registerPlanTools(server: McpServer, ynabClient: YnabClient) {
  server.registerTool(
    "ynab_list_plans",
    {
      title: "List YNAB Plans",
      description: "Lists all available YNAB plans and the default plan when one exists.",
      inputSchema: {}
    },
    async () => {
      try {
        return toTextResult(await listPlans(ynabClient));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_plan",
    {
      title: "Get YNAB Plan",
      description: "Returns a compact summary for a single YNAB plan.",
      inputSchema: {
        planId: z.string().min(1)
      }
    },
    async ({ planId }) => {
      try {
        return toTextResult(await getPlan(ynabClient, planId));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_list_categories",
    {
      title: "List YNAB Categories",
      description: "Lists visible category groups and categories for a YNAB plan.",
      inputSchema: {
        planId: z.string().min(1)
      }
    },
    async ({ planId }) => {
      try {
        return toTextResult(await listCategories(ynabClient, planId));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_category",
    {
      title: "Get YNAB Category",
      description: "Returns a compact summary for a single category in a YNAB plan.",
      inputSchema: {
        planId: z.string().min(1),
        categoryId: z.string().min(1)
      }
    },
    async ({ planId, categoryId }) => {
      try {
        return toTextResult(await getCategory(ynabClient, planId, categoryId));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_month_category",
    {
      title: "Get YNAB Month Category",
      description: "Returns a compact summary for a single category in a specific plan month.",
      inputSchema: {
        planId: z.string().min(1),
        month: z.string().min(1),
        categoryId: z.string().min(1)
      }
    },
    async ({ planId, month, categoryId }) => {
      try {
        return toTextResult(await getMonthCategory(ynabClient, planId, month, categoryId));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_plan_settings",
    {
      title: "Get YNAB Plan Settings",
      description: "Returns plan-level formatting settings for a YNAB plan.",
      inputSchema: {
        planId: z.string().min(1)
      }
    },
    async ({ planId }) => {
      try {
        return toTextResult(await getPlanSettings(ynabClient, planId));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_list_plan_months",
    {
      title: "List YNAB Plan Months",
      description: "Lists visible month summaries for a YNAB plan.",
      inputSchema: {
        planId: z.string().min(1)
      }
    },
    async ({ planId }) => {
      try {
        return toTextResult(await listPlanMonths(ynabClient, planId));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_plan_month",
    {
      title: "Get YNAB Plan Month",
      description: "Returns a compact summary for a specific month in a YNAB plan.",
      inputSchema: {
        planId: z.string().min(1),
        month: z.string().min(1)
      }
    },
    async ({ planId, month }) => {
      try {
        return toTextResult(await getPlanMonth(ynabClient, planId, month));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );
}
