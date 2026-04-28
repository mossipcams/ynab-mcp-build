import { describe, expect, it } from "vitest";

import { createYnabDeltaClient } from "./delta-client.js";

describe("YNAB delta client", () => {
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
