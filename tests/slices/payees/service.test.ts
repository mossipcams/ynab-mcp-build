import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { listPayees } from "../../../src/slices/payees/service.js";
import { getPayeeToolDefinitions } from "../../../src/slices/payees/tools.js";

describe("payees service", () => {
  it("filters deleted payees from list output", async () => {
    // DEFECT: deleted payees can leak into list output and make compact payee pickers show stale records.
    const ynabClient = {
      listPayees: vi.fn().mockResolvedValue([
        {
          id: "payee-1",
          name: "Grocer",
          transferAccountId: null,
          deleted: false,
        },
        {
          id: "payee-2",
          name: "Old Payee",
          transferAccountId: null,
          deleted: true,
        },
      ]),
      listPlans: vi.fn().mockResolvedValue({
        plans: [{ id: "plan-1", name: "Household" }],
        defaultPlan: { id: "plan-1", name: "Household" },
      }),
    };

    await expect(listPayees(ynabClient as never, {})).resolves.toEqual({
      payees: [
        {
          id: "payee-1",
          name: "Grocer",
          transfer_account_id: null,
        },
      ],
      payee_count: 1,
    });
  });

  it("exposes only the compact payee list schema", () => {
    // DEFECT: dead-weight payee detail/location tools can creep back into the public surface.
    const ynabClient = {
      listPayees: vi.fn(),
    };
    const definitions = getPayeeToolDefinitions(ynabClient as never);
    const listTool = definitions.find(
      (definition) => definition.name === "ynab_list_payees",
    );

    expect(definitions.map((definition) => definition.name)).toEqual([
      "ynab_list_payees",
    ]);
    expect(listTool).toBeDefined();
    expect(() => z.object(listTool?.inputSchema ?? {}).parse({})).not.toThrow();
  });
});
