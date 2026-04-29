import type { YnabClient } from "../../platform/ynab/client.js";
import { defineTool, type SliceToolDefinition } from "../../shared/tool-definition.js";
import { monthFieldSchema, paginationSchema, planIdSchema } from "../../shared/tool-inputs.js";
import {
  getMoneyMovementGroups,
  getMoneyMovementGroupsByMonth,
  getMoneyMovements,
  getMoneyMovementsByMonth
} from "./service.js";

export function getMoneyMovementToolDefinitions(ynabClient: YnabClient): SliceToolDefinition[] {
  return [
    defineTool({
      name: "ynab_get_money_movements",
      title: "Get YNAB Money Movements",
      description: "Returns transfer-style money movements derived from YNAB transactions.",
      inputSchema: {
        ...planIdSchema,
        ...paginationSchema
      },
      execute: async (input) => getMoneyMovements(ynabClient, input)
    }),
    defineTool({
      name: "ynab_get_money_movements_by_month",
      title: "Get YNAB Money Movements By Month",
      description: "Returns transfer-style money movements for a single plan month.",
      inputSchema: {
        ...planIdSchema,
        month: monthFieldSchema,
        ...paginationSchema
      },
      execute: async (input) => getMoneyMovementsByMonth(ynabClient, input)
    }),
    defineTool({
      name: "ynab_get_money_movement_groups",
      title: "Get YNAB Money Movement Groups",
      description: "Groups transfer-style money movements by source and destination account.",
      inputSchema: {
        ...planIdSchema,
        ...paginationSchema
      },
      execute: async (input) => getMoneyMovementGroups(ynabClient, input)
    }),
    defineTool({
      name: "ynab_get_money_movement_groups_by_month",
      title: "Get YNAB Money Movement Groups By Month",
      description: "Groups transfer-style money movements by source and destination account for a single month.",
      inputSchema: {
        ...planIdSchema,
        month: monthFieldSchema,
        ...paginationSchema
      },
      execute: async (input) => getMoneyMovementGroupsByMonth(ynabClient, input)
    })
  ];
}
