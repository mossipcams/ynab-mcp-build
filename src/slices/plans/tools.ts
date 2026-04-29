import {
  defineTool,
  type SliceToolDefinition,
} from "../../shared/tool-definition.js";
import type { YnabClient } from "../../platform/ynab/client.js";
import {
  monthFieldSchema,
  planIdSchema,
  requiredIdSchema,
} from "../../shared/tool-inputs.js";
import {
  getCategory,
  getMonthCategory,
  getPlan,
  getPlanMonth,
  getPlanSettings,
  listCategories,
  listPlanMonths,
  listPlans,
} from "./service.js";

export function getPlanToolDefinitions(
  ynabClient: YnabClient,
): SliceToolDefinition[] {
  return [
    defineTool({
      name: "ynab_list_plans",
      title: "List YNAB Plans",
      description:
        "Lists all available YNAB plans and the default plan when one exists.",
      inputSchema: {},
      execute: async () => listPlans(ynabClient),
    }),
    defineTool({
      name: "ynab_get_plan",
      title: "Get YNAB Plan",
      description: "Returns a compact summary for a single YNAB plan.",
      inputSchema: planIdSchema,
      execute: async ({ planId }) => getPlan(ynabClient, planId),
    }),
    defineTool({
      name: "ynab_list_categories",
      title: "List YNAB Categories",
      description:
        "Lists visible category groups and categories for a YNAB plan.",
      inputSchema: planIdSchema,
      execute: async ({ planId }) => listCategories(ynabClient, planId),
    }),
    defineTool({
      name: "ynab_get_category",
      title: "Get YNAB Category",
      description:
        "Returns a compact summary for a single category in a YNAB plan.",
      inputSchema: {
        ...planIdSchema,
        categoryId: requiredIdSchema,
      },
      execute: async ({ planId, categoryId }) =>
        getCategory(ynabClient, planId, categoryId),
    }),
    defineTool({
      name: "ynab_get_month_category",
      title: "Get YNAB Month Category",
      description:
        "Returns a compact summary for a single category in a specific plan month.",
      inputSchema: {
        ...planIdSchema,
        month: monthFieldSchema,
        categoryId: requiredIdSchema,
      },
      execute: async ({ planId, month, categoryId }) =>
        getMonthCategory(ynabClient, planId, month, categoryId),
    }),
    defineTool({
      name: "ynab_get_plan_settings",
      title: "Get YNAB Plan Settings",
      description: "Returns plan-level formatting settings for a YNAB plan.",
      inputSchema: planIdSchema,
      execute: async ({ planId }) => getPlanSettings(ynabClient, planId),
    }),
    defineTool({
      name: "ynab_list_plan_months",
      title: "List YNAB Plan Months",
      description: "Lists visible month summaries for a YNAB plan.",
      inputSchema: planIdSchema,
      execute: async ({ planId }) => listPlanMonths(ynabClient, planId),
    }),
    defineTool({
      name: "ynab_get_plan_month",
      title: "Get YNAB Plan Month",
      description:
        "Returns a compact summary for a specific month in a YNAB plan.",
      inputSchema: {
        ...planIdSchema,
        month: monthFieldSchema,
      },
      execute: async ({ planId, month }) =>
        getPlanMonth(ynabClient, planId, month),
    }),
  ];
}
