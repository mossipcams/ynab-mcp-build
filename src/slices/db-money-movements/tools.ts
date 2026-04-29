import {
  defineTool,
  type SliceToolDefinition,
} from "../../shared/tool-definition.js";
import {
  monthFieldSchema,
  paginationSchema,
  planIdSchema,
} from "../../shared/tool-inputs.js";
import {
  getDbMoneyMovementGroups,
  getDbMoneyMovementGroupsByMonth,
  getDbMoneyMovements,
  getDbMoneyMovementsByMonth,
} from "./service.js";

export type DbMoneyMovementToolDependencies = Parameters<
  typeof getDbMoneyMovements
>[0];

export function getDbMoneyMovementToolDefinitions(
  dependencies: DbMoneyMovementToolDependencies,
): SliceToolDefinition[] {
  return [
    defineTool({
      name: "ynab_get_money_movements",
      title: "Get YNAB Money Movements",
      description:
        "Returns category money movements synced from the D1 read model.",
      inputSchema: {
        ...planIdSchema,
        ...paginationSchema,
      },
      execute: async (input) => getDbMoneyMovements(dependencies, input),
    }),
    defineTool({
      name: "ynab_get_money_movements_by_month",
      title: "Get YNAB Money Movements By Month",
      description:
        "Returns category money movements synced from the D1 read model for a single month.",
      inputSchema: {
        ...planIdSchema,
        month: monthFieldSchema,
        ...paginationSchema,
      },
      execute: async (input) => getDbMoneyMovementsByMonth(dependencies, input),
    }),
    defineTool({
      name: "ynab_get_money_movement_groups",
      title: "Get YNAB Money Movement Groups",
      description:
        "Groups category money movements synced from the D1 read model.",
      inputSchema: {
        ...planIdSchema,
        ...paginationSchema,
      },
      execute: async (input) => getDbMoneyMovementGroups(dependencies, input),
    }),
    defineTool({
      name: "ynab_get_money_movement_groups_by_month",
      title: "Get YNAB Money Movement Groups By Month",
      description:
        "Groups category money movements synced from the D1 read model for a single month.",
      inputSchema: {
        ...planIdSchema,
        month: monthFieldSchema,
        ...paginationSchema,
      },
      execute: async (input) =>
        getDbMoneyMovementGroupsByMonth(dependencies, input),
    }),
  ];
}
