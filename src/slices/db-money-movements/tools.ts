import {
  defineTool,
  type SliceToolDefinition,
} from "../../shared/tool-definition.js";
import { z } from "zod";

import {
  monthFieldSchema,
  paginationSchema,
  planIdSchema,
} from "../../shared/tool-inputs.js";
import { searchDbMoneyMovements } from "./service.js";

export type DbMoneyMovementToolDependencies = Parameters<
  typeof searchDbMoneyMovements
>[0];

export function getDbMoneyMovementToolDefinitions(
  dependencies: DbMoneyMovementToolDependencies,
): SliceToolDefinition[] {
  return [
    defineTool({
      name: "ynab_search_money_movements",
      title: "Search YNAB Money Movements",
      description:
        "Searches category money movements synced from the D1 read model.",
      inputSchema: {
        ...planIdSchema,
        month: monthFieldSchema.optional(),
        fromMonth: monthFieldSchema.optional(),
        toMonth: monthFieldSchema.optional(),
        groupBy: z.enum(["movement", "group"]).optional(),
        ...paginationSchema,
      },
      execute: async (input) => searchDbMoneyMovements(dependencies, input),
    }),
  ];
}
