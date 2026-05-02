import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_LIMIT,
  formatAmountMilliunits,
  paginateEntries,
} from "./collections.js";

describe("collection helpers", () => {
  it("rounds milliunit half-cents away from zero", () => {
    // DEFECT: floating-point toFixed formatting can round exact half-cent milliunit values toward zero.
    expect(formatAmountMilliunits(1005)).toBe("1.01");
    expect(formatAmountMilliunits(-1005)).toBe("-1.01");
  });

  it("formats integer milliunits with cent precision using integer rounding", () => {
    // DEFECT: money formatting can drift when decimal conversion happens before rounding to cents.
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }),
        (milliunits) => {
          const absoluteRoundedCents = Math.floor(
            (Math.abs(milliunits) + 5) / 10,
          );
          const dollars = Math.trunc(absoluteRoundedCents / 100);
          const cents = String(absoluteRoundedCents % 100).padStart(2, "0");
          const sign = milliunits < 0 && absoluteRoundedCents > 0 ? "-" : "";

          expect(formatAmountMilliunits(milliunits)).toBe(
            `${sign}${dollars}.${cents}`,
          );
        },
      ),
    );
  });

  it("keeps pagination metadata consistent with sliced entries", () => {
    // DEFECT: pagination metadata can drift from the actual slice, especially at exact end boundaries.
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { maxLength: 200 }),
        fc.option(fc.integer({ min: -50, max: 250 }), { nil: undefined }),
        fc.option(fc.integer({ min: -50, max: 250 }), { nil: undefined }),
        (entries, limitInput, offsetInput) => {
          const result = paginateEntries(entries, {
            limit: limitInput,
            offset: offsetInput,
          });
          const expectedLimit = Math.max(
            Math.trunc(limitInput ?? DEFAULT_LIMIT),
            1,
          );
          const expectedOffset = Math.max(Math.trunc(offsetInput ?? 0), 0);
          const expectedEntries = entries.slice(
            expectedOffset,
            expectedOffset + expectedLimit,
          );

          expect(result.entries).toEqual(expectedEntries);
          expect(result.metadata).toEqual({
            has_more: expectedOffset + expectedEntries.length < entries.length,
            limit: expectedLimit,
            offset: expectedOffset,
            returned_count: expectedEntries.length,
          });
        },
      ),
    );
  });

  it("falls back to safe pagination defaults for non-finite controls", () => {
    // DEFECT: non-finite pagination values can leak into slice indexes and produce empty or unstable pages.
    const entries = [1, 2, 3];

    expect(
      paginateEntries(entries, {
        limit: Number.POSITIVE_INFINITY,
        offset: Number.NaN,
      }),
    ).toEqual({
      entries,
      metadata: {
        has_more: false,
        limit: DEFAULT_LIMIT,
        offset: 0,
        returned_count: entries.length,
      },
    });
  });
});
