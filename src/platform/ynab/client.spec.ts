import { describe, expect, it } from "vitest";

import { createYnabClient } from "./client.js";

function transactionResponse() {
  return {
    data: {
      transactions: [
        {
          account_id: "account-1",
          account_name: "Checking",
          amount: -12000,
          approved: true,
          category_id: "category-1",
          category_name: "Groceries",
          cleared: "cleared",
          date: "2026-04-12",
          deleted: false,
          id: "txn-1",
          payee_id: "payee-1",
          payee_name: "Market",
          transfer_account_id: null
        }
      ]
    }
  };
}

describe("ynab scoped transaction client methods", () => {
  it("uses scoped transaction endpoints for account, category, and payee drilldowns", async () => {
    const requests: Array<string | URL | Request> = [];
    const client = createYnabClient({
      accessToken: "pat-secret",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn: async (input) => {
        requests.push(input);

        return Response.json(transactionResponse());
      }
    });

    await client.listTransactionsByAccount("plan-1", "account-1");
    await client.listTransactionsByCategory("plan-1", "category-1");
    await client.listTransactionsByPayee("plan-1", "payee-1");

    expect(requests.map(String)).toEqual([
      "https://api.ynab.com/v1/plans/plan-1/accounts/account-1/transactions",
      "https://api.ynab.com/v1/plans/plan-1/categories/category-1/transactions",
      "https://api.ynab.com/v1/plans/plan-1/payees/payee-1/transactions"
    ]);
  });
});
