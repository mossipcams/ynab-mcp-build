import {
  defineTool,
  type SliceToolDefinition,
} from "../../shared/tool-definition.js";
import type { YnabClient } from "../../platform/ynab/client.js";
import {
  normalizedMonthFieldSchema,
  planIdSchema,
  requiredIdSchema,
} from "../../shared/tool-inputs.js";
import {
  getCategory,
  getPlanMonth,
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
        "Returns a compact summary for a category, optionally scoped to a specific plan month.",
      inputSchema: {
        ...planIdSchema,
        categoryId: requiredIdSchema,
        month: normalizedMonthFieldSchema.optional(),
      },
      execute: async ({ planId, categoryId, month }) =>
        getCategory(ynabClient, planId, categoryId, month),
    }),
    defineTool({
      name: "ynab_list_months",
      title: "List YNAB Months",
      description: "Lists visible month summaries for a YNAB plan.",
      inputSchema: planIdSchema,
      execute: async ({ planId }) => listPlanMonths(ynabClient, planId),
    }),
    defineTool({
      name: "ynab_get_month",
      title: "Get YNAB Month",
      description:
        "Returns a compact summary for a specific month in a YNAB plan.",
      inputSchema: {
        ...planIdSchema,
        month: normalizedMonthFieldSchema,
      },
      execute: async ({ planId, month }) =>
        getPlanMonth(ynabClient, planId, month),
    }),
  ];
}
