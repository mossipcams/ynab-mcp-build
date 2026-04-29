import { describe, expect, it, vi } from "vitest";

import { createYnabClient } from "../platform/ynab/client.js";
import { createYnabDeltaClient } from "../platform/ynab/delta-client.js";

describe("YNAB upstream chaos", () => {
  it("retries transient upstream responses before surfacing a YNAB API failure", async () => {
    let calls = 0;
    const fetchFn = vi.fn(async () => {
      calls += 1;

      if (calls === 1) {
        return Response.json(
          { error: { detail: "temporary upstream outage" } },
          { status: 500, statusText: "Server Error" }
        );
      }

      return Response.json({
        data: {
          default_plan: { id: "plan-1", name: "Household" },
          plans: [{ id: "plan-1", name: "Household" }]
        }
      });
    }) as unknown as typeof fetch;
    const client = createYnabClient({
      accessToken: "token",
      baseUrl: "https://api.example.test",
      fetchFn
    });

    await expect(client.listPlans()).resolves.toEqual({
      defaultPlan: { id: "plan-1", name: "Household" },
      plans: [{ id: "plan-1", name: "Household" }]
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("retries transient upstream responses for delta endpoints", async () => {
    let calls = 0;
    const fetchFn = vi.fn(async () => {
      calls += 1;

      if (calls === 1) {
        return Response.json(
          { error: { detail: "temporary delta outage" } },
          { status: 500, statusText: "Server Error" }
        );
      }

      return Response.json({
        data: {
          accounts: [
            {
              balance: 0,
              closed: false,
              id: "account-1",
              name: "Checking",
              type: "checking"
            }
          ],
          server_knowledge: 12
        }
      });
    }) as unknown as typeof fetch;
    const client = createYnabDeltaClient({
      accessToken: "token",
      baseUrl: "https://api.example.test",
      fetchFn
    });

    await expect(client.listAccountsDelta("plan-1")).resolves.toEqual({
      records: [
        {
          balance: 0,
          closed: false,
          id: "account-1",
          name: "Checking",
          type: "checking"
        }
      ],
      serverKnowledge: 12
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
