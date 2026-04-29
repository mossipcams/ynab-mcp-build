import type { YnabClient } from "../../platform/ynab/client.js";
import {
  defineTool,
  type SliceToolDefinition,
} from "../../shared/tool-definition.js";
import {
  paginatedProjectionSchema,
  planIdSchema,
  requiredIdSchema,
} from "../../shared/tool-inputs.js";
import {
  getPayee,
  getPayeeLocation,
  getPayeeLocationsByPayee,
  listPayeeLocations,
  listPayees,
} from "./service.js";

const payeeFields = ["name", "transfer_account_id"] as const;

export function getPayeeToolDefinitions(
  ynabClient: YnabClient,
): SliceToolDefinition[] {
  return [
    defineTool({
      name: "ynab_list_payees",
      title: "List YNAB Payees",
      description:
        "Lists YNAB payees with optional pagination and compact field projection.",
      inputSchema: paginatedProjectionSchema(payeeFields),
      execute: async (input) => listPayees(ynabClient, input),
    }),
    defineTool({
      name: "ynab_get_payee",
      title: "Get YNAB Payee",
      description: "Returns a compact summary for a single YNAB payee.",
      inputSchema: {
        ...planIdSchema,
        payeeId: requiredIdSchema,
      },
      execute: async (input) => getPayee(ynabClient, input),
    }),
    defineTool({
      name: "ynab_list_payee_locations",
      title: "List YNAB Payee Locations",
      description: "Lists payee locations for the current YNAB plan.",
      inputSchema: planIdSchema,
      execute: async (input) => listPayeeLocations(ynabClient, input),
    }),
    defineTool({
      name: "ynab_get_payee_location",
      title: "Get YNAB Payee Location",
      description: "Returns a single YNAB payee location.",
      inputSchema: {
        ...planIdSchema,
        payeeLocationId: requiredIdSchema,
      },
      execute: async (input) => getPayeeLocation(ynabClient, input),
    }),
    defineTool({
      name: "ynab_get_payee_locations_by_payee",
      title: "Get YNAB Payee Locations By Payee",
      description: "Lists payee locations for a single YNAB payee.",
      inputSchema: {
        ...planIdSchema,
        payeeId: requiredIdSchema,
      },
      execute: async (input) => getPayeeLocationsByPayee(ynabClient, input),
    }),
  ];
}
