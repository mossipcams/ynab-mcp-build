import { z } from "zod";

import type { SliceToolDefinition } from "../../shared/tool-definition.js";
import {
  getDbMoneyMovementGroups,
  getDbMoneyMovementGroupsByMonth,
  getDbMoneyMovements,
  getDbMoneyMovementsByMonth
} from "./service.js";

export type DbMoneyMovementToolDependencies = Parameters<typeof getDbMoneyMovements>[0];

export function getDbMoneyMovementToolDefinitions(
  dependencies: DbMoneyMovementToolDependencies
): SliceToolDefinition[] {
  return [
    {
      name: "ynab_get_money_movements",
      title: "Get YNAB Money Movements",
      description: "Returns category money movements synced from the D1 read model.",
      inputSchema: {
        planId: z.string().optional(),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional()
      },
      execute: async (input) => getDbMoneyMovements(dependencies, input)
    },
    {
      name: "ynab_get_money_movements_by_month",
      title: "Get YNAB Money Movements By Month",
      description: "Returns category money movements synced from the D1 read model for a single month.",
      inputSchema: {
        planId: z.string().optional(),
        month: z.string().min(1),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional()
      },
      execute: async (input) => getDbMoneyMovementsByMonth(dependencies, input)
    },
    {
      name: "ynab_get_money_movement_groups",
      title: "Get YNAB Money Movement Groups",
      description: "Groups category money movements synced from the D1 read model.",
      inputSchema: {
        planId: z.string().optional(),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional()
      },
      execute: async (input) => getDbMoneyMovementGroups(dependencies, input)
    },
    {
      name: "ynab_get_money_movement_groups_by_month",
      title: "Get YNAB Money Movement Groups By Month",
      description: "Groups category money movements synced from the D1 read model for a single month.",
      inputSchema: {
        planId: z.string().optional(),
        month: z.string().min(1),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional()
      },
      execute: async (input) => getDbMoneyMovementGroupsByMonth(dependencies, input)
    }
  ];
}
