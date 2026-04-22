import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { YnabClient } from "../../platform/ynab/client.js";
import { toErrorResult, toTextResult } from "../../shared/results.js";
import {
  getMoneyMovementGroups,
  getMoneyMovementGroupsByMonth,
  getMoneyMovements,
  getMoneyMovementsByMonth
} from "./service.js";

export function registerMoneyMovementTools(server: McpServer, ynabClient: YnabClient) {
  server.registerTool(
    "ynab_get_money_movements",
    {
      title: "Get YNAB Money Movements",
      description: "Returns transfer-style money movements derived from YNAB transactions.",
      inputSchema: {
        planId: z.string().optional()
      }
    },
    async (input) => {
      try {
        return toTextResult(await getMoneyMovements(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_money_movements_by_month",
    {
      title: "Get YNAB Money Movements By Month",
      description: "Returns transfer-style money movements for a single plan month.",
      inputSchema: {
        planId: z.string().optional(),
        month: z.string().min(1)
      }
    },
    async (input) => {
      try {
        return toTextResult(await getMoneyMovementsByMonth(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_money_movement_groups",
    {
      title: "Get YNAB Money Movement Groups",
      description: "Groups transfer-style money movements by source and destination account.",
      inputSchema: {
        planId: z.string().optional()
      }
    },
    async (input) => {
      try {
        return toTextResult(await getMoneyMovementGroups(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_money_movement_groups_by_month",
    {
      title: "Get YNAB Money Movement Groups By Month",
      description: "Groups transfer-style money movements by source and destination account for a single month.",
      inputSchema: {
        planId: z.string().optional(),
        month: z.string().min(1)
      }
    },
    async (input) => {
      try {
        return toTextResult(await getMoneyMovementGroupsByMonth(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );
}
