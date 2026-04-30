import {
  linearRegression,
  mean,
  sampleCorrelation,
  standardDeviation,
  zScore,
} from "simple-statistics";

export function calculateLinearRegressionSlope(values: readonly number[]) {
  if (values.length < 2) {
    return undefined;
  }

  const result = linearRegression(values.map((value, index) => [index, value]));

  return Number.isFinite(result.m) ? result.m : undefined;
}

export function calculateZScore(
  observedValue: number,
  baselineValues: readonly number[],
) {
  if (baselineValues.length === 0) {
    return undefined;
  }

  const baselineStandardDeviation = standardDeviation(baselineValues);
  if (baselineStandardDeviation === 0) {
    return 0;
  }

  const score = zScore(
    observedValue,
    mean(baselineValues),
    baselineStandardDeviation,
  );

  return Number.isFinite(score) ? score : undefined;
}

export function calculatePearsonCorrelation(
  leftValues: readonly number[],
  rightValues: readonly number[],
) {
  const valueCount = Math.min(leftValues.length, rightValues.length);
  if (valueCount < 2) {
    return undefined;
  }

  const left = leftValues.slice(0, valueCount);
  const right = rightValues.slice(0, valueCount);
  const correlation = sampleCorrelation(left, right);

  return Number.isFinite(correlation) ? correlation : undefined;
}
