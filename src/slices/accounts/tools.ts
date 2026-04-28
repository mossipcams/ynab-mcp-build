import type { YnabClient } from "../../platform/ynab/client.js";
import type { SliceToolDefinition } from "../../shared/tool-definition.js";
import { paginatedProjectionSchema, planIdSchema, requiredIdSchema } from "../../shared/tool-inputs.js";
import { getAccount, listAccounts } from "./service.js";

const accountFields = ["name", "type", "closed", "balance"] as const;

export function getAccountToolDefinitions(ynabClient: YnabClient): SliceToolDefinition[] {
  return [
    {
      name: "ynab_list_accounts",
      title: "List YNAB Accounts",
      description: "Lists YNAB accounts with optional pagination and compact field projection.",
      inputSchema: paginatedProjectionSchema(accountFields),
      execute: async (input) => listAccounts(ynabClient, input)
    },
    {
      name: "ynab_get_account",
      title: "Get YNAB Account",
      description: "Returns a compact summary for a single YNAB account.",
      inputSchema: {
        ...planIdSchema,
        accountId: requiredIdSchema
      },
      execute: async (input) => getAccount(ynabClient, input)
    }
  ];
}
