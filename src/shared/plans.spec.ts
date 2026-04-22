import { describe, expect, it, vi } from "vitest";

import type { YnabClient } from "../platform/ynab/client.js";
import { resolvePlanId } from "./plans.js";

describe("resolvePlanId", () => {
  it("prefers the default plan when no explicit plan id is provided", async () => {
    const ynabClient = {
      listPlans: vi.fn<YnabClient["listPlans"]>().mockResolvedValue({
        plans: [
          {
            id: "plan-1",
            name: "Household"
          }
        ],
        defaultPlan: {
          id: "plan-2",
          name: "Shared"
        }
      })
    } as Pick<YnabClient, "listPlans"> as YnabClient;

    await expect(resolvePlanId(ynabClient, undefined)).resolves.toBe("plan-2");
    expect(ynabClient.listPlans).toHaveBeenCalledTimes(1);
  });
});
