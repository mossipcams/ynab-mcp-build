import { z } from "zod";

import type { McpToolDefinition } from "../../mcp/tools.js";
import type { YnabClient } from "../../platform/ynab/client.js";
import {
  getMoneyMovementGroups,
  getMoneyMovementGroupsByMonth,
  getMoneyMovements,
  getMoneyMovementsByMonth
} from "./service.js";

export function getMoneyMovementToolDefinitions(ynabClient: YnabClient): McpToolDefinition[] {
  return [
    {
      name: "ynab_get_money_movements",
      title: "Get YNAB Money Movements",
      description: "Returns transfer-style money movements derived from YNAB transactions.",
      inputSchema: {
        planId: z.string().optional()
      },
      execute: (input) => getMoneyMovements(ynabClient, input)
    },
    {
      name: "ynab_get_money_movements_by_month",
      title: "Get YNAB Money Movements By Month",
      description: "Returns transfer-style money movements for a single plan month.",
      inputSchema: {
        planId: z.string().optional(),
        month: z.string().min(1)
      },
      execute: (input) => getMoneyMovementsByMonth(ynabClient, input)
    },
    {
      name: "ynab_get_money_movement_groups",
      title: "Get YNAB Money Movement Groups",
      description: "Groups transfer-style money movements by source and destination account.",
      inputSchema: {
        planId: z.string().optional()
      },
      execute: (input) => getMoneyMovementGroups(ynabClient, input)
    },
    {
      name: "ynab_get_money_movement_groups_by_month",
      title: "Get YNAB Money Movement Groups By Month",
      description: "Groups transfer-style money movements by source and destination account for a single month.",
      inputSchema: {
        planId: z.string().optional(),
        month: z.string().min(1)
      },
      execute: (input) => getMoneyMovementGroupsByMonth(ynabClient, input)
    }
  ];
}
