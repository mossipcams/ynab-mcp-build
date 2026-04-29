import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  listPayeeLocations,
  listPayees,
} from "../../../src/slices/payees/service.js";
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

  it("filters deleted payee locations from location listings", async () => {
    // DEFECT: deleted payee locations can leak into geolocation output and cause clients to render stale map points.
    const ynabClient = {
      listPayeeLocations: vi.fn().mockResolvedValue([
        {
          id: "location-1",
          payeeId: "payee-1",
          latitude: 30.2672,
          longitude: -97.7431,
          deleted: false,
        },
        {
          id: "location-2",
          payeeId: "payee-2",
          latitude: 40.7128,
          longitude: -74.006,
          deleted: true,
        },
      ]),
      listPlans: vi.fn().mockResolvedValue({
        plans: [{ id: "plan-1", name: "Household" }],
        defaultPlan: { id: "plan-1", name: "Household" },
      }),
    };

    await expect(listPayeeLocations(ynabClient as never, {})).resolves.toEqual({
      payee_locations: [
        {
          id: "location-1",
          payee_id: "payee-1",
          latitude: 30.2672,
          longitude: -97.7431,
        },
      ],
      payee_location_count: 1,
    });
  });

  it("requires payeeId in the payee lookup tool schema", () => {
    // DEFECT: the payee tool contract can lose its required payeeId field and push malformed requests into slice execution.
    const ynabClient = {
      getPayee: vi.fn(),
      getPayeeLocation: vi.fn(),
      getPayeeLocationsByPayee: vi.fn(),
      listPayeeLocations: vi.fn(),
      listPayees: vi.fn(),
    };
    const definitions = getPayeeToolDefinitions(ynabClient as never);
    const payeeTool = definitions.find(
      (definition) => definition.name === "ynab_get_payee",
    );

    expect(payeeTool).toBeDefined();
    expect(() => z.object(payeeTool?.inputSchema ?? {}).parse({})).toThrow();
  });
});
