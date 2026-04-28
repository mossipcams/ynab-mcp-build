import { describe, expect, it, vi } from "vitest";

import { resolvePlanId } from "./plans.js";

describe("resolvePlanId", () => {
  it("reuses the default plan lookup for the same YNAB client", async () => {
    const ynabClient = {
      listPlans: vi.fn().mockResolvedValue({
        defaultPlan: {
          id: "plan-1",
          name: "Household"
        },
        plans: [{ id: "plan-1", name: "Household" }]
      })
    };

    await expect(
      Promise.all([
        resolvePlanId(ynabClient as never, undefined),
        resolvePlanId(ynabClient as never, undefined)
      ])
    ).resolves.toEqual(["plan-1", "plan-1"]);
    await expect(resolvePlanId(ynabClient as never, undefined)).resolves.toBe("plan-1");

    expect(ynabClient.listPlans).toHaveBeenCalledTimes(1);
  });

  it("does not use the default plan lookup for explicit plan ids", async () => {
    const ynabClient = {
      listPlans: vi.fn()
    };

    await expect(resolvePlanId(ynabClient as never, " plan-explicit ")).resolves.toBe("plan-explicit");

    expect(ynabClient.listPlans).not.toHaveBeenCalled();
  });
});
