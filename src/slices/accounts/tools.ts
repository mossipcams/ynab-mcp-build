import { z } from "zod";

import type { McpToolDefinition } from "../../mcp/tools.js";
import type { YnabClient } from "../../platform/ynab/client.js";
import { getAccount, listAccounts } from "./service.js";

export function getAccountToolDefinitions(ynabClient: YnabClient): McpToolDefinition[] {
  return [
    {
      name: "ynab_list_accounts",
      title: "List YNAB Accounts",
      description: "Lists YNAB accounts with optional pagination and compact field projection.",
      inputSchema: {
        planId: z.string().optional(),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional(),
        fields: z.array(z.enum(["name", "type", "closed", "balance"])).optional(),
        includeIds: z.boolean().optional()
      },
      execute: (input) => listAccounts(ynabClient, input)
    },
    {
      name: "ynab_get_account",
      title: "Get YNAB Account",
      description: "Returns a compact summary for a single YNAB account.",
      inputSchema: {
        planId: z.string().optional(),
        accountId: z.string().min(1)
      },
      execute: (input) => getAccount(ynabClient, input)
    }
  ];
}
