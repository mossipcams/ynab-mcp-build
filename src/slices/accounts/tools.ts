import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { YnabClient } from "../../platform/ynab/client.js";
import { toErrorResult, toTextResult } from "../../shared/results.js";
import { getAccount, listAccounts } from "./service.js";

export function registerAccountTools(server: McpServer, ynabClient: YnabClient) {
  server.registerTool(
    "ynab_list_accounts",
    {
      title: "List YNAB Accounts",
      description: "Lists YNAB accounts with optional pagination and compact field projection.",
      inputSchema: {
        planId: z.string().optional(),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional(),
        fields: z.array(z.enum(["name", "type", "closed", "balance"])).optional(),
        includeIds: z.boolean().optional()
      }
    },
    async (input) => {
      try {
        return toTextResult(await listAccounts(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_account",
    {
      title: "Get YNAB Account",
      description: "Returns a compact summary for a single YNAB account.",
      inputSchema: {
        planId: z.string().optional(),
        accountId: z.string().min(1)
      }
    },
    async (input) => {
      try {
        return toTextResult(await getAccount(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );
}
