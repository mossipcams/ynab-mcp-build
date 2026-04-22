import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../../app/create-app.js";

function createTestEnv(): Env {
  return {
    MCP_SERVER_NAME: "ynab-mcp-build",
    MCP_SERVER_VERSION: "0.1.0",
    YNAB_API_BASE_URL: "https://api.ynab.com/v1"
  } as Env;
}

describe("payees slice", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("lists payees using the default plan when planId is omitted", async () => {
    const ynabClient = {
      listPlans: vi.fn().mockResolvedValue({
        plans: [{ id: "plan-1", name: "Household" }],
        defaultPlan: { id: "plan-1", name: "Household" }
      }),
      getUser: vi.fn(),
      getPlan: vi.fn(),
      listCategories: vi.fn(),
      getCategory: vi.fn(),
      getMonthCategory: vi.fn(),
      getPlanSettings: vi.fn(),
      listPlanMonths: vi.fn(),
      getPlanMonth: vi.fn(),
      listAccounts: vi.fn(),
      getAccount: vi.fn(),
      listTransactions: vi.fn(),
      getTransaction: vi.fn(),
      listScheduledTransactions: vi.fn(),
      getScheduledTransaction: vi.fn(),
      listPayees: vi.fn().mockResolvedValue([
        {
          id: "payee-1",
          name: "Groceries",
          transferAccountId: null,
          deleted: false
        },
        {
          id: "payee-2",
          name: "Transfer",
          transferAccountId: "account-2",
          deleted: false
        },
        {
          id: "payee-3",
          name: "Archived",
          transferAccountId: null,
          deleted: true
        }
      ]),
      getPayee: vi.fn(),
      listPayeeLocations: vi.fn(),
      getPayeeLocation: vi.fn(),
      getPayeeLocationsByPayee: vi.fn()
    };
    const app = createApp({ ynabClient });
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        return app.fetch(request, createTestEnv());
      }
    });
    const client = new Client({
      name: "ynab-mcp-build-test-client",
      version: "1.0.0"
    });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport);

    const result = await client.callTool({
      name: "ynab_list_payees",
      arguments: {}
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(ynabClient.listPayees).toHaveBeenCalledWith("plan-1");
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      payees: [
        {
          id: "payee-1",
          name: "Groceries",
          transfer_account_id: null
        },
        {
          id: "payee-2",
          name: "Transfer",
          transfer_account_id: "account-2"
        }
      ],
      payee_count: 2
    });
  });

  it("returns a compact single payee summary", async () => {
    const ynabClient = {
      listPlans: vi.fn().mockResolvedValue({
        plans: [{ id: "plan-1", name: "Household" }],
        defaultPlan: { id: "plan-1", name: "Household" }
      }),
      getUser: vi.fn(),
      getPlan: vi.fn(),
      listCategories: vi.fn(),
      getCategory: vi.fn(),
      getMonthCategory: vi.fn(),
      getPlanSettings: vi.fn(),
      listPlanMonths: vi.fn(),
      getPlanMonth: vi.fn(),
      listAccounts: vi.fn(),
      getAccount: vi.fn(),
      listTransactions: vi.fn(),
      getTransaction: vi.fn(),
      listScheduledTransactions: vi.fn(),
      getScheduledTransaction: vi.fn(),
      listPayees: vi.fn(),
      getPayee: vi.fn().mockResolvedValue({
        id: "payee-1",
        name: "Groceries",
        transferAccountId: null,
        deleted: false
      }),
      listPayeeLocations: vi.fn(),
      getPayeeLocation: vi.fn(),
      getPayeeLocationsByPayee: vi.fn()
    };
    const app = createApp({ ynabClient });
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        return app.fetch(request, createTestEnv());
      }
    });
    const client = new Client({
      name: "ynab-mcp-build-test-client",
      version: "1.0.0"
    });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport);

    const result = await client.callTool({
      name: "ynab_get_payee",
      arguments: {
        payeeId: "payee-1"
      }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(ynabClient.getPayee).toHaveBeenCalledWith("plan-1", "payee-1");
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      payee: {
        id: "payee-1",
        name: "Groceries"
      }
    });
  });

  it("lists payee locations for the current plan", async () => {
    const ynabClient = {
      listPlans: vi.fn().mockResolvedValue({
        plans: [{ id: "plan-1", name: "Household" }],
        defaultPlan: { id: "plan-1", name: "Household" }
      }),
      getUser: vi.fn(),
      getPlan: vi.fn(),
      listCategories: vi.fn(),
      getCategory: vi.fn(),
      getMonthCategory: vi.fn(),
      getPlanSettings: vi.fn(),
      listPlanMonths: vi.fn(),
      getPlanMonth: vi.fn(),
      listAccounts: vi.fn(),
      getAccount: vi.fn(),
      listTransactions: vi.fn(),
      getTransaction: vi.fn(),
      listScheduledTransactions: vi.fn(),
      getScheduledTransaction: vi.fn(),
      listPayees: vi.fn(),
      getPayee: vi.fn(),
      listPayeeLocations: vi.fn().mockResolvedValue([
        {
          id: "location-1",
          payeeId: "payee-1",
          latitude: 30.2672,
          longitude: -97.7431,
          deleted: false
        },
        {
          id: "location-2",
          payeeId: "payee-2",
          latitude: 40.7128,
          longitude: -74.006,
          deleted: true
        }
      ]),
      getPayeeLocation: vi.fn(),
      getPayeeLocationsByPayee: vi.fn()
    };
    const app = createApp({ ynabClient });
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        return app.fetch(request, createTestEnv());
      }
    });
    const client = new Client({
      name: "ynab-mcp-build-test-client",
      version: "1.0.0"
    });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport);

    const result = await client.callTool({
      name: "ynab_list_payee_locations",
      arguments: {}
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(ynabClient.listPayeeLocations).toHaveBeenCalledWith("plan-1");
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      payee_locations: [
        {
          id: "location-1",
          payee_id: "payee-1",
          latitude: 30.2672,
          longitude: -97.7431
        }
      ],
      payee_location_count: 1
    });
  });

  it("returns a single payee location", async () => {
    const ynabClient = {
      listPlans: vi.fn().mockResolvedValue({
        plans: [{ id: "plan-1", name: "Household" }],
        defaultPlan: { id: "plan-1", name: "Household" }
      }),
      getUser: vi.fn(),
      getPlan: vi.fn(),
      listCategories: vi.fn(),
      getCategory: vi.fn(),
      getMonthCategory: vi.fn(),
      getPlanSettings: vi.fn(),
      listPlanMonths: vi.fn(),
      getPlanMonth: vi.fn(),
      listAccounts: vi.fn(),
      getAccount: vi.fn(),
      listTransactions: vi.fn(),
      getTransaction: vi.fn(),
      listScheduledTransactions: vi.fn(),
      getScheduledTransaction: vi.fn(),
      listPayees: vi.fn(),
      getPayee: vi.fn(),
      listPayeeLocations: vi.fn(),
      getPayeeLocation: vi.fn().mockResolvedValue({
        id: "location-1",
        payeeId: "payee-1",
        latitude: 30.2672,
        longitude: -97.7431,
        deleted: false
      }),
      getPayeeLocationsByPayee: vi.fn()
    };
    const app = createApp({ ynabClient });
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        return app.fetch(request, createTestEnv());
      }
    });
    const client = new Client({
      name: "ynab-mcp-build-test-client",
      version: "1.0.0"
    });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport);

    const result = await client.callTool({
      name: "ynab_get_payee_location",
      arguments: {
        payeeLocationId: "location-1"
      }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(ynabClient.getPayeeLocation).toHaveBeenCalledWith("plan-1", "location-1");
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      payee_location: {
        id: "location-1",
        payee_id: "payee-1",
        latitude: 30.2672,
        longitude: -97.7431
      }
    });
  });

  it("returns payee locations filtered by payee", async () => {
    const ynabClient = {
      listPlans: vi.fn().mockResolvedValue({
        plans: [{ id: "plan-1", name: "Household" }],
        defaultPlan: { id: "plan-1", name: "Household" }
      }),
      getUser: vi.fn(),
      getPlan: vi.fn(),
      listCategories: vi.fn(),
      getCategory: vi.fn(),
      getMonthCategory: vi.fn(),
      getPlanSettings: vi.fn(),
      listPlanMonths: vi.fn(),
      getPlanMonth: vi.fn(),
      listAccounts: vi.fn(),
      getAccount: vi.fn(),
      listTransactions: vi.fn(),
      getTransaction: vi.fn(),
      listScheduledTransactions: vi.fn(),
      getScheduledTransaction: vi.fn(),
      listPayees: vi.fn(),
      getPayee: vi.fn(),
      listPayeeLocations: vi.fn(),
      getPayeeLocation: vi.fn(),
      getPayeeLocationsByPayee: vi.fn().mockResolvedValue([
        {
          id: "location-1",
          payeeId: "payee-1",
          latitude: 30.2672,
          longitude: -97.7431,
          deleted: false
        },
        {
          id: "location-2",
          payeeId: "payee-1",
          latitude: 30.3,
          longitude: -97.7,
          deleted: true
        }
      ])
    };
    const app = createApp({ ynabClient });
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        return app.fetch(request, createTestEnv());
      }
    });
    const client = new Client({
      name: "ynab-mcp-build-test-client",
      version: "1.0.0"
    });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport);

    const result = await client.callTool({
      name: "ynab_get_payee_locations_by_payee",
      arguments: {
        payeeId: "payee-1"
      }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(ynabClient.getPayeeLocationsByPayee).toHaveBeenCalledWith("plan-1", "payee-1");
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      payee_locations: [
        {
          id: "location-1",
          payee_id: "payee-1",
          latitude: 30.2672,
          longitude: -97.7431
        }
      ],
      payee_location_count: 1
    });
  });
});
