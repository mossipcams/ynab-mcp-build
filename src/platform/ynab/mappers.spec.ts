import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  dollarsToMilliunits,
  milliunitsToDollars,
  sumSubtransactionAmounts,
} from "./mappers.js";

describe("ynab mapper calculation helpers", () => {
  it("round-trips generated integer milliunits through dollar conversion", () => {
    // DEFECT: mapper conversions can drift when integer milliunits cross dollar-shaped boundaries.
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }),
        (milliunits) => {
          expect(dollarsToMilliunits(milliunitsToDollars(milliunits))).toBe(
            milliunits,
          );
        },
      ),
    );
  });

  it("rounds generated dollar amounts to the nearest milliunit", () => {
    // DEFECT: fractional dollar amounts can be truncated or rounded at cent precision before reaching YNAB milliunits.
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }),
        (thousandthsOfADollar) => {
          const amount = thousandthsOfADollar / 1000;

          expect(dollarsToMilliunits(amount)).toBe(thousandthsOfADollar);
        },
      ),
    );
  });

  it("sums generated subtransaction milliunits independently of order", () => {
    // DEFECT: split transaction totals can become order-sensitive or drop negative subtransactions.
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -1_000_000, max: 1_000_000 }), {
          minLength: 1,
          maxLength: 50,
        }),
        (amounts) => {
          const expected = amounts.reduce((sum, amount) => sum + amount, 0);
          const forward = sumSubtransactionAmounts(
            amounts.map((amount) => ({ amount })),
          );
          const backward = sumSubtransactionAmounts(
            amounts
              .slice()
              .reverse()
              .map((amount) => ({ amount })),
          );

          expect(forward).toBe(expected);
          expect(backward).toBe(expected);
        },
      ),
    );
  });
});
