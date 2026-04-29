import { describe, expect, it, vi } from "vitest";

import { listPlans } from "./service.js";

describe("plans service", () => {
  it("returns YNAB's default plan when one is provided", async () => {
    const ynabClient = {
      listPlans: vi.fn().mockResolvedValue({
        defaultPlan: {
          id: "plan-default",
          name: "Default",
        },
        plans: [
          { id: "plan-1", name: "One" },
          { id: "plan-default", name: "Default" },
        ],
      }),
    };

    await expect(listPlans(ynabClient as never)).resolves.toMatchObject({
      default_plan: {
        id: "plan-default",
        name: "Default",
      },
    });
  });

  it("returns the only plan as default when YNAB provides no default", async () => {
    const ynabClient = {
      listPlans: vi.fn().mockResolvedValue({
        defaultPlan: null,
        plans: [{ id: "plan-only", name: "Only plan" }],
      }),
    };

    await expect(listPlans(ynabClient as never)).resolves.toMatchObject({
      default_plan: {
        id: "plan-only",
        name: "Only plan",
      },
    });
  });

  it("does not return a default plan when multiple plans exist without a YNAB default", async () => {
    const ynabClient = {
      listPlans: vi.fn().mockResolvedValue({
        defaultPlan: null,
        plans: [
          { id: "plan-1", name: "One" },
          { id: "plan-2", name: "Two" },
        ],
      }),
    };

    await expect(listPlans(ynabClient as never)).resolves.toMatchObject({
      default_plan: null,
    });
  });
});
