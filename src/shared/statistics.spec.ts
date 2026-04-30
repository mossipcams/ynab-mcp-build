import { describe, expect, it } from "vitest";

import {
  calculateLinearRegressionSlope,
  calculatePearsonCorrelation,
  calculateZScore,
} from "./statistics.js";

describe("statistics helpers", () => {
  it("calculates the slope of a simple linear series", () => {
    expect(calculateLinearRegressionSlope([100, 200, 300, 400])).toBe(100);
  });

  it("returns zero z-score when the baseline has no variation", () => {
    expect(calculateZScore(250, [200, 200, 200])).toBe(0);
  });

  it("calculates a positive Pearson correlation for matching movement", () => {
    expect(calculatePearsonCorrelation([100, 200, 300], [50, 75, 100])).toBe(1);
  });

  it("omits Pearson correlation when there are not enough paired values", () => {
    expect(calculatePearsonCorrelation([100], [50])).toBeUndefined();
  });
});
