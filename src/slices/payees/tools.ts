import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { YnabClient } from "../../platform/ynab/client.js";
import { toErrorResult, toTextResult } from "../../shared/results.js";
import {
  getPayee,
  getPayeeLocation,
  getPayeeLocationsByPayee,
  listPayeeLocations,
  listPayees
} from "./service.js";

const payeeFields = ["name", "transfer_account_id"] as const;

export function registerPayeeTools(server: McpServer, ynabClient: YnabClient) {
  server.registerTool(
    "ynab_list_payees",
    {
      title: "List YNAB Payees",
      description: "Lists YNAB payees with optional pagination and compact field projection.",
      inputSchema: {
        planId: z.string().optional(),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional(),
        fields: z.array(z.enum(payeeFields)).optional(),
        includeIds: z.boolean().optional()
      }
    },
    async (input) => {
      try {
        return toTextResult(await listPayees(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_payee",
    {
      title: "Get YNAB Payee",
      description: "Returns a compact summary for a single YNAB payee.",
      inputSchema: {
        planId: z.string().optional(),
        payeeId: z.string().min(1)
      }
    },
    async (input) => {
      try {
        return toTextResult(await getPayee(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_list_payee_locations",
    {
      title: "List YNAB Payee Locations",
      description: "Lists payee locations for the current YNAB plan.",
      inputSchema: {
        planId: z.string().optional()
      }
    },
    async (input) => {
      try {
        return toTextResult(await listPayeeLocations(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_payee_location",
    {
      title: "Get YNAB Payee Location",
      description: "Returns a single YNAB payee location.",
      inputSchema: {
        planId: z.string().optional(),
        payeeLocationId: z.string().min(1)
      }
    },
    async (input) => {
      try {
        return toTextResult(await getPayeeLocation(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_payee_locations_by_payee",
    {
      title: "Get YNAB Payee Locations By Payee",
      description: "Lists payee locations for a single YNAB payee.",
      inputSchema: {
        planId: z.string().optional(),
        payeeId: z.string().min(1)
      }
    },
    async (input) => {
      try {
        return toTextResult(await getPayeeLocationsByPayee(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );
}
