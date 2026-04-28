import { describe, expect, it } from "vitest";

import { createYnabDeltaClient } from "./delta-client.js";

describe("YNAB delta client", () => {
  it("sends endpoint-specific cursors and returns changed records for every cursor-backed read-model endpoint", async () => {
    const requests: Array<string | URL | Request> = [];
    const client = createYnabDeltaClient({
      accessToken: "pat-secret",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn: async (input) => {
        requests.push(input);
        const url = new URL(String(input));
        const endpoint = url.pathname.split("/").at(-1);

        if (endpoint === "accounts") {
          return Response.json({
            data: {
              accounts: [{ id: "account-1", name: "Checking", type: "checking", closed: false, balance: 12000 }],
              server_knowledge: 201
            }
          });
        }

        if (endpoint === "categories") {
          return Response.json({
            data: {
              category_groups: [{ id: "group-1", name: "Everyday", hidden: false, deleted: false, categories: [] }],
              server_knowledge: 202
            }
          });
        }

        if (endpoint === "months") {
          return Response.json({
            data: {
              months: [{ month: "2026-04-01", income: 0, budgeted: 0, activity: 0, to_be_budgeted: 0, categories: [] }],
              server_knowledge: 203
            }
          });
        }

        if (endpoint === "payees") {
          return Response.json({
            data: {
              payees: [{ id: "payee-1", name: "Market", deleted: false }],
              server_knowledge: 204
            }
          });
        }

        if (endpoint === "payee_locations") {
          return Response.json({
            data: {
              payee_locations: [{ id: "location-1", payee_id: "payee-1", latitude: "41.0", longitude: "-87.0", deleted: false }],
              server_knowledge: 205
            }
          });
        }

        if (endpoint === "scheduled_transactions") {
          return Response.json({
            data: {
              scheduled_transactions: [{ id: "scheduled-1", date_first: "2026-04-01", date_next: "2026-05-01", amount: -45000 }],
              server_knowledge: 206
            }
          });
        }

        return Response.json({
          data: {
            server_knowledge: 207,
            transactions: []
          }
        });
      }
    });

    await expect(client.listAccountsDelta("plan-1", 101)).resolves.toMatchObject({
      records: [{ id: "account-1", name: "Checking" }],
      serverKnowledge: 201
    });
    await expect(client.listCategoriesDelta("plan-1", 102)).resolves.toMatchObject({
      records: [{ id: "group-1", name: "Everyday" }],
      serverKnowledge: 202
    });
    await expect(client.listMonthsDelta("plan-1", 103)).resolves.toMatchObject({
      records: [{ month: "2026-04-01" }],
      serverKnowledge: 203
    });
    await expect(client.listPayeesDelta("plan-1", 104)).resolves.toMatchObject({
      records: [{ id: "payee-1", name: "Market" }],
      serverKnowledge: 204
    });
    await expect(client.listPayeeLocationsDelta("plan-1", 105)).resolves.toMatchObject({
      records: [{ id: "location-1", payeeId: "payee-1" }],
      serverKnowledge: 205
    });
    await expect(client.listScheduledTransactionsDelta("plan-1", 106)).resolves.toMatchObject({
      records: [{ id: "scheduled-1", dateFirst: "2026-04-01" }],
      serverKnowledge: 206
    });
    await client.listTransactionsDelta("plan-1", 107);

    expect(requests.map(String)).toEqual([
      "https://api.ynab.com/v1/plans/plan-1/accounts?last_knowledge_of_server=101",
      "https://api.ynab.com/v1/plans/plan-1/categories?last_knowledge_of_server=102",
      "https://api.ynab.com/v1/plans/plan-1/months?last_knowledge_of_server=103",
      "https://api.ynab.com/v1/plans/plan-1/payees?last_knowledge_of_server=104",
      "https://api.ynab.com/v1/plans/plan-1/payee_locations?last_knowledge_of_server=105",
      "https://api.ynab.com/v1/plans/plan-1/scheduled_transactions?last_knowledge_of_server=106",
      "https://api.ynab.com/v1/plans/plan-1/transactions?last_knowledge_of_server=107"
    ]);
  });

  it("sends the last server knowledge cursor and returns the new cursor with changed transactions", async () => {
    const requests: Array<string | URL | Request> = [];
    const client = createYnabDeltaClient({
      accessToken: "pat-secret",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn: async (input) => {
        requests.push(input);

        return Response.json({
          data: {
            server_knowledge: 456,
            transactions: [
              {
                id: "txn-1",
                date: "2026-04-12",
                amount: -12000,
                memo: "weekly run",
                cleared: "cleared",
                approved: true,
                flag_name: null,
                account_id: "account-1",
                account_name: "Checking",
                payee_id: "payee-1",
                payee_name: "Market",
                category_id: "category-1",
                category_name: "Groceries",
                transfer_account_id: null,
                deleted: false
              },
              {
                id: "txn-2",
                date: "2026-04-13",
                amount: -3000,
                deleted: true
              }
            ]
          }
        });
      }
    });

    const result = await client.listTransactionsDelta("plan-1", 123);

    expect(requests.map(String)).toEqual([
      "https://api.ynab.com/v1/plans/plan-1/transactions?last_knowledge_of_server=123"
    ]);
    expect(result.serverKnowledge).toBe(456);
    expect(result.records).toEqual([
      expect.objectContaining({
        id: "txn-1",
        memo: "weekly run",
        flag_name: null,
        amount: -12000,
        deleted: false
      }),
      expect.objectContaining({
        id: "txn-2",
        amount: -3000,
        deleted: true
      })
    ]);
  });

  it("omits the cursor parameter when no prior server knowledge exists", async () => {
    const requests: Array<string | URL | Request> = [];
    const client = createYnabDeltaClient({
      accessToken: "pat-secret",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn: async (input) => {
        requests.push(input);

        return Response.json({
          data: {
            server_knowledge: 1,
            transactions: []
          }
        });
      }
    });

    await client.listTransactionsDelta("plan-1");

    expect(requests.map(String)).toEqual([
      "https://api.ynab.com/v1/plans/plan-1/transactions"
    ]);
  });
});
