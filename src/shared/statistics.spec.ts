import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  calculateLinearRegressionSlope,
  calculatePearsonCorrelation,
  calculateZScore,
} from "./statistics.js";

describe("statistics helpers", () => {
  const expectCloseTo = (actual: number | undefined, expected: number) => {
    expect(actual).toBeDefined();
    expect(actual!).toBeCloseTo(expected, 10);
  };

  it("calculates the slope of a simple linear series", () => {
    expect(calculateLinearRegressionSlope([100, 200, 300, 400])).toBe(100);
  });

  it("omits regression slopes for empty or single-value series", () => {
    // DEFECT: unusable trend inputs can escape as thrown errors or non-finite slope values.
    expect(calculateLinearRegressionSlope([])).toBeUndefined();
    expect(calculateLinearRegressionSlope([100])).toBeUndefined();
  });

  it("calculates flat and decreasing regression slopes", () => {
    expect(calculateLinearRegressionSlope([50, 50, 50, 50])).toBe(0);
    expect(calculateLinearRegressionSlope([400, 300, 200, 100])).toBe(-100);
  });

  it("omits regression slopes for non-finite series values", () => {
    // DEFECT: non-finite read-model values can make trend calculations throw instead of omitting diagnostics.
    expect(
      calculateLinearRegressionSlope([100, Number.NaN, 300]),
    ).toBeUndefined();
    expect(
      calculateLinearRegressionSlope([100, Number.POSITIVE_INFINITY, 300]),
    ).toBeUndefined();
  });

  it("omits z-score when the baseline is empty", () => {
    // DEFECT: empty baselines can make anomaly calculations report misleading numeric scores.
    expect(calculateZScore(250, [])).toBeUndefined();
  });

  it("returns zero z-score when the baseline has no variation", () => {
    expect(calculateZScore(250, [200, 200, 200])).toBe(0);
  });

  it("omits z-score for non-finite observed or baseline values", () => {
    // DEFECT: invalid anomaly inputs can bubble up as thrown statistics-library errors.
    expect(calculateZScore(Number.NaN, [200, 250, 300])).toBeUndefined();
    expect(
      calculateZScore(250, [200, Number.POSITIVE_INFINITY, 300]),
    ).toBeUndefined();
  });

  it("calculates a positive Pearson correlation for matching movement", () => {
    expect(calculatePearsonCorrelation([100, 200, 300], [50, 75, 100])).toBe(1);
  });

  it("omits Pearson correlation when there are not enough paired values", () => {
    expect(calculatePearsonCorrelation([100], [50])).toBeUndefined();
  });

  it("omits Pearson correlation for zero-variance paired values", () => {
    // DEFECT: flat assigned or spent sequences can make correlation helpers throw instead of omitting diagnostics.
    expect(
      calculatePearsonCorrelation([100, 100, 100], [50, 75, 100]),
    ).toBeUndefined();
    expect(
      calculatePearsonCorrelation([100, 200, 300], [50, 50, 50]),
    ).toBeUndefined();
  });

  it("calculates Pearson correlation from matching paired prefixes", () => {
    expect(calculatePearsonCorrelation([100, 200, 999], [50, 75])).toBe(1);
  });

  it("omits Pearson correlation for non-finite paired values", () => {
    // DEFECT: invalid paired values can crash category trend diagnostics.
    expect(
      calculatePearsonCorrelation([100, Number.NaN], [50, 75]),
    ).toBeUndefined();
    expect(
      calculatePearsonCorrelation([100, 200], [50, Number.NEGATIVE_INFINITY]),
    ).toBeUndefined();
  });

  it("returns the step size as the regression slope for generated linear series", () => {
    // DEFECT: trend slope calculations can accidentally scale by value count instead of month index.
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.integer({ min: -100_000, max: 100_000 }),
        fc.integer({ min: 2, max: 24 }),
        (start, step, count) => {
          const values = Array.from(
            { length: count },
            (_value, index) => start + step * index,
          );

          expectCloseTo(calculateLinearRegressionSlope(values), step);
        },
      ),
    );
  });

  it("keeps z-score signs aligned with the observed value relative to the baseline mean", () => {
    // DEFECT: anomaly scores can invert when mean and standard deviation inputs are wired in the wrong order.
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -100_000, max: 100_000 }), {
          minLength: 2,
          maxLength: 20,
        }),
        fc.integer({ min: 1, max: 100_000 }),
        (baseline, offset) => {
          fc.pre(new Set(baseline).size > 1);
          const baselineMean =
            baseline.reduce((sum, value) => sum + value, 0) / baseline.length;

          expect(
            calculateZScore(baselineMean + offset, baseline),
          ).toBeGreaterThan(0);
          expect(calculateZScore(baselineMean - offset, baseline)).toBeLessThan(
            0,
          );
        },
      ),
    );
  });

  it("correlates identical non-constant series near one", () => {
    // DEFECT: correlation diagnostics can drift if generated pairs are reordered or truncated incorrectly.
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -100_000, max: 100_000 }), {
          minLength: 2,
          maxLength: 20,
        }),
        (values) => {
          fc.pre(new Set(values).size > 1);

          expectCloseTo(calculatePearsonCorrelation(values, values), 1);
        },
      ),
    );
  });

  it("correlates reversed monotonic series near negative one", () => {
    // DEFECT: opposing category trend movement can be reported as positive correlation.
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 2, max: 24 }),
        (start, step, count) => {
          const increasing = Array.from(
            { length: count },
            (_value, index) => start + step * index,
          );
          const decreasing = increasing.slice().reverse();

          expectCloseTo(
            calculatePearsonCorrelation(increasing, decreasing),
            -1,
          );
        },
      ),
    );
  });
});
