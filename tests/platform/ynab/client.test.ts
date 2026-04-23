import { describe, expect, it } from "vitest";

import { createYnabClient, YnabClientError } from "../../../src/platform/ynab/client.js";
import { readYnabFixture } from "./fixtures.js";

describe("ynab client transport errors", () => {
  it("sends the bearer authorization header on requests", async () => {
    // DEFECT: outbound YNAB requests can omit the PAT header and fail every call in production.
    const requests: RequestInit[] = [];
    const client = createYnabClient({
      accessToken: "pat-secret",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn: async (_input, init) => {
        requests.push(init ?? {});

        return new Response(
          JSON.stringify({
            data: {
              user: {
                id: "user-1",
                name: "Test User"
              }
            }
          }),
          {
            headers: {
              "content-type": "application/json"
            },
            status: 200
          }
        );
      }
    });

    await client.getUser();

    expect(requests[0]?.headers).toMatchObject({
      Authorization: "Bearer pat-secret"
    });
  });

  it("uses the /plans collection path", async () => {
    // DEFECT: transport path regressions can silently revert to the legacy /budgets endpoint after migration.
    const requests: Array<string | URL | Request> = [];
    const plansResponse = readYnabFixture<{
      data: {
        default_plan: { id: string; name: string } | null;
        plans: Array<{ id: string; last_modified_on?: string; name: string }>;
      };
    }>("plans-response.json");
    const client = createYnabClient({
      accessToken: "pat-secret",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn: async (input) => {
        requests.push(input);

        return new Response(
          JSON.stringify(plansResponse),
          {
            headers: {
              "content-type": "application/json"
            },
            status: 200
          }
        );
      }
    });

    await client.listPlans();

    expect(String(requests[0])).toBe("https://api.ynab.com/v1/plans");
  });

  it("uses the /plans resource path for plan-scoped endpoints", async () => {
    // DEFECT: plan-scoped transport paths can silently revert to the legacy /budgets prefix after migration.
    const requests: Array<string | URL | Request> = [];
    const accountsResponse = readYnabFixture<{
      data: {
        accounts: Array<Record<string, unknown>>;
      };
    }>("accounts-response.json");
    const client = createYnabClient({
      accessToken: "pat-secret",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn: async (input) => {
        requests.push(input);

        return new Response(
          JSON.stringify(accountsResponse),
          {
            headers: {
              "content-type": "application/json"
            },
            status: 200
          }
        );
      }
    });

    await client.listAccounts("plan-1");

    expect(String(requests[0])).toBe("https://api.ynab.com/v1/plans/plan-1/accounts");
  });

  it("maps 429 responses into retryable rate-limit errors", async () => {
    // DEFECT: rate-limited upstream responses can be misclassified and trigger the wrong retry behavior.
    const client = createYnabClient({
      accessToken: "pat-secret",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn: async () =>
        new Response(
          JSON.stringify({
            error: {
              detail: "Too many requests"
            }
          }),
          {
            headers: {
              "Retry-After": "15",
              "content-type": "application/json"
            },
            status: 429,
            statusText: "Too Many Requests"
          }
        )
    });

    await expect(client.getUser()).rejects.toMatchObject({
      category: "rate_limit",
      retryable: true
    } satisfies Partial<YnabClientError>);
  });

  it("maps 401 responses into non-retryable internal misconfiguration errors", async () => {
    // DEFECT: an invalid worker PAT can be misclassified as client auth failure and send operators debugging the wrong system.
    const client = createYnabClient({
      accessToken: "pat-secret",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn: async () =>
        new Response(
          JSON.stringify({
            error: {
              detail: "The access token provided is invalid."
            }
          }),
          {
            headers: {
              "content-type": "application/json"
            },
            status: 401,
            statusText: "Unauthorized"
          }
        )
    });

    await expect(client.getUser()).rejects.toMatchObject({
      category: "internal",
      retryable: false
    } satisfies Partial<YnabClientError>);
  });

  it("maps 5xx responses into retryable upstream errors", async () => {
    // DEFECT: upstream outages can be misreported as local bugs and suppress safe retries.
    const client = createYnabClient({
      accessToken: "pat-secret",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn: async () =>
        new Response(
          JSON.stringify({
            error: {
              detail: "Temporary outage"
            }
          }),
          {
            headers: {
              "content-type": "application/json"
            },
            status: 503,
            statusText: "Service Unavailable"
          }
        )
    });

    await expect(client.getUser()).rejects.toMatchObject({
      category: "upstream",
      retryable: true
    } satisfies Partial<YnabClientError>);
  });

  it("maps malformed successful JSON into retryable upstream errors", async () => {
    // DEFECT: upstream schema or body corruption can escape as generic syntax errors without retry semantics.
    const client = createYnabClient({
      accessToken: "pat-secret",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn: async () =>
        new Response("{not-json", {
          headers: {
            "content-type": "application/json"
          },
          status: 200
        })
    });

    await expect(client.getUser()).rejects.toMatchObject({
      category: "upstream",
      retryable: true
    } satisfies Partial<YnabClientError>);
  });

  it("accepts current account response fields without depending on the new formatted/currency additions", async () => {
    // DEFECT: tests can freeze the client against an outdated account fixture and miss harmless additive schema evolution.
    const accountsResponse = readYnabFixture<{
      data: {
        accounts: Array<Record<string, unknown>>;
      };
    }>("accounts-response.json");
    const client = createYnabClient({
      accessToken: "pat-secret",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn: async () =>
        new Response(
          JSON.stringify(accountsResponse),
          {
            headers: {
              "content-type": "application/json"
            },
            status: 200
          }
        )
    });

    await expect(client.listAccounts("plan-1")).resolves.toMatchObject([
      {
        id: "account-1",
        balance: 123450,
        name: "Checking"
      }
    ]);
  });

  it("ignores additive unknown fields in successful YNAB responses", async () => {
    // DEFECT: additive upstream fields can break deserialization even though the client only consumes a stable response subset.
    const client = createYnabClient({
      accessToken: "pat-secret",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn: async () =>
        new Response(
          JSON.stringify({
            data: {
              user: {
                id: "user-1",
                name: "Test User",
                unexpected_nested: {
                  region: "us"
                }
              },
              server_trace_id: "trace-123"
            },
            additive_top_level: true
          }),
          {
            headers: {
              "content-type": "application/json"
            },
            status: 200
          }
        )
    });

    await expect(client.getUser()).resolves.toMatchObject({
      id: "user-1",
      name: "Test User"
    });
  });

  it("accepts current transaction response fields without depending on the new formatted/currency additions", async () => {
    // DEFECT: tests can reject additive transaction fields from the current schema even though the mapper only consumes a stable subset.
    const transactionsResponse = readYnabFixture<{
      data: {
        transactions: Array<Record<string, unknown>>;
      };
    }>("transactions-response.json");
    const client = createYnabClient({
      accessToken: "pat-secret",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn: async () =>
        new Response(
          JSON.stringify(transactionsResponse),
          {
            headers: {
              "content-type": "application/json"
            },
            status: 200
          }
        )
    });

    await expect(client.listTransactions("plan-1")).resolves.toMatchObject([
      {
        id: "txn-1",
        amount: -4560,
        accountId: "account-1",
        isTransfer: false
      }
    ]);
  });

  it("maps the current category response fixture shape without depending on newer goal fields", async () => {
    // DEFECT: active client tests can lag behind current category response fields and miss schema drift in goal metadata.
    const categoriesResponse = readYnabFixture<{
      data: {
        category_groups: Array<Record<string, unknown>>;
      };
    }>("categories-response.json");
    const client = createYnabClient({
      accessToken: "pat-secret",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn: async () =>
        new Response(JSON.stringify(categoriesResponse), {
          headers: {
            "content-type": "application/json"
          },
          status: 200
        })
    });

    await expect(client.listCategories("plan-1")).resolves.toMatchObject([
      {
        id: "group-1",
        categories: [
          {
            id: "category-1",
            categoryGroupName: "Immediate Obligations",
            name: "Rent"
          }
        ],
        name: "Immediate Obligations"
      }
    ]);
  });

  it("maps the current scheduled transaction fixture shape without depending on newer additive fields", async () => {
    // DEFECT: scheduled transaction tests can miss current additive subtransaction and presentation fields while the mapper still needs to tolerate them.
    const scheduledTransactionsResponse = readYnabFixture<{
      data: {
        scheduled_transactions: Array<Record<string, unknown>>;
      };
    }>("scheduled-transactions-response.json");
    const client = createYnabClient({
      accessToken: "pat-secret",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn: async () =>
        new Response(JSON.stringify(scheduledTransactionsResponse), {
          headers: {
            "content-type": "application/json"
          },
          status: 200
        })
    });

    await expect(client.listScheduledTransactions("plan-1")).resolves.toMatchObject([
      {
        accountName: "Checking",
        amount: -120000,
        categoryName: "Utilities",
        dateFirst: "2026-04-01",
        dateNext: "2026-05-01",
        id: "scheduled-1",
        payeeName: "Internet Provider"
      }
    ]);
  });

  it("maps fetch-layer failures into retryable upstream errors", async () => {
    // DEFECT: network failures can escape uncategorized and prevent safe retry logic from triggering.
    const client = createYnabClient({
      accessToken: "pat-secret",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn: async () => {
        throw new Error("network timeout");
      }
    });

    await expect(client.getUser()).rejects.toMatchObject({
      category: "upstream",
      retryable: true
    } satisfies Partial<YnabClientError>);
  });
});
