import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { formatAmountMilliunits } from "../../shared/collections.js";
import {
  buildAssignedSpentSummary,
  formatMilliunits,
  toSpentMilliunits,
} from "./helpers.js";

function formatMilliunitsOracle(milliunits: number) {
  const roundedCents = Math.floor((Math.abs(milliunits) + 5) / 10);
  const dollars = Math.trunc(roundedCents / 100);
  const cents = String(roundedCents % 100).padStart(2, "0");
  const sign = milliunits < 0 && roundedCents > 0 ? "-" : "";

  return `${sign}${dollars}.${cents}`;
}

describe("financial health calculation helpers", () => {
  it("formats milliunits with cent precision using integer rounding", () => {
    // DEFECT: display helpers can drift from YNAB milliunit math when decimal formatting rounds half-cents through floating point.
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }),
        (milliunits) => {
          expect(formatMilliunits(milliunits)).toBe(
            formatMilliunitsOracle(milliunits),
          );
        },
      ),
    );
  });

  it("matches the shared milliunit amount formatter for generated values", () => {
    // DEFECT: independent money formatters can drift and show different amounts for the same stored milliunits.
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }),
        (milliunits) => {
          expect(formatMilliunits(milliunits)).toBe(
            formatAmountMilliunits(milliunits),
          );
        },
      ),
    );
  });

  it("does not emit negative zero for tiny negative milliunit values", () => {
    // DEFECT: values that round to zero cents can render as '-0.00' and confuse compact summaries.
    fc.assert(
      fc.property(fc.integer({ min: -4, max: -1 }), (milliunits) => {
        expect(formatMilliunits(milliunits)).toBe("0.00");
      }),
    );
  });

  it("converts only negative activity into spent milliunits", () => {
    // DEFECT: positive inflow activity can be counted as spending or negative activity can keep its sign.
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }),
        (activityMilliunits) => {
          const expected =
            activityMilliunits < 0 ? Math.abs(activityMilliunits) : 0;

          expect(toSpentMilliunits(activityMilliunits)).toBe(expected);
        },
      ),
    );
  });

  it("keeps assigned-vs-spent equal to assigned minus spent", () => {
    // DEFECT: summary deltas can silently add spending to assigned money instead of subtracting it.
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }),
        fc.integer({ min: 0, max: 1_000_000_000 }),
        (assignedMilliunits, spentMilliunits) => {
          expect(
            buildAssignedSpentSummary(assignedMilliunits, spentMilliunits),
          ).toEqual({
            assigned: formatMilliunitsOracle(assignedMilliunits),
            spent: formatMilliunitsOracle(spentMilliunits),
            assigned_vs_spent: formatMilliunitsOracle(
              assignedMilliunits - spentMilliunits,
            ),
          });
        },
      ),
    );
  });
});
