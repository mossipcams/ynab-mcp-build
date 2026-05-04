import { describe, expect, it } from "vitest";

import type { YnabClient } from "../../platform/ynab/client.js";
import {
  calculateLinearRegressionSlopeForPairs,
  calculatePearsonCorrelation,
} from "../../shared/statistics.js";
import {
  getCashFlowSummary,
  getCategoryTrendSummary,
  getIncomeSummary,
  getSpendingSummary,
  getSpendingAnomalies,
} from "./service.js";
import { formatMilliunits } from "./helpers.js";
import {
  blsAnnualIncomeAndExpenditureSeries,
  blsMajorCategorySpending2023,
  blsMajorCategorySpendingSeries,
  externalCalculationSources,
  nistLotteryUnivariateExample,
  nistNorrisRegressionExample,
  ynabMilliunitExamples,
} from "./online-calculation-fixtures.js";

describe("online-sourced calculation examples", () => {
  it("records official external sources for the verified fixtures", () => {
    expect(externalCalculationSources).toEqual({
      blsConsumerExpenditures2023:
        "https://www.bls.gov/opub/reports/consumer-expenditures/2023/",
      nistNorrisCertifiedValues:
        "https://www.itl.nist.gov/div898/strd/lls/data/LINKS/v-Norris.shtml",
      nistNorrisData:
        "https://www.itl.nist.gov/div898/strd/lls/data/LINKS/DATA/Norris.dat",
      nistLotteryCertifiedValues:
        "https://www.itl.nist.gov/div898/strd/univ/certvalues/lottery.html",
      nistLotteryData:
        "https://www.itl.nist.gov/div898/strd/univ/data/Lottery.dat",
      ynabApiMilliunits: "https://api.ynab.com/",
    });
  });

  it("formats YNAB API milliunit examples as decimal currency amounts", () => {
    // Source: https://api.ynab.com/ documents that YNAB stores currency amounts in milliunits.
    for (const example of ynabMilliunitExamples) {
      expect(formatMilliunits(example.milliunits)).toBe(example.amount);
    }
  });

  it("matches the NIST Norris certified regression correlation", () => {
    // Source: NIST StRD Norris reports certified R-squared for this x/y dataset.
    expect(
      calculatePearsonCorrelation(
        nistNorrisRegressionExample.x,
        nistNorrisRegressionExample.y,
      ),
    ).toBeCloseTo(nistNorrisRegressionExample.certifiedCorrelation, 12);
  });

  it("matches the NIST Norris certified regression slope", () => {
    // Source: NIST StRD Norris reports the certified beta(1) slope estimate.
    const points = nistNorrisRegressionExample.x.map(
      (x, index): [number, number] => [
        x,
        nistNorrisRegressionExample.y[index]!,
      ],
    );

    expect(calculateLinearRegressionSlopeForPairs(points)).toBeCloseTo(
      nistNorrisRegressionExample.certifiedSlope,
      12,
    );
  });

  it("matches NIST Lottery certified sample mean", () => {
    // Source: NIST StRD Lottery reports the certified sample mean.
    const sampleMean =
      nistLotteryUnivariateExample.values.reduce(
        (sum, value) => sum + value,
        0,
      ) / nistLotteryUnivariateExample.values.length;

    expect(sampleMean).toBeCloseTo(
      nistLotteryUnivariateExample.certifiedSampleMean,
      12,
    );
  });

  it("matches NIST Lottery certified sample standard deviation", () => {
    // Source: NIST StRD Lottery reports the certified sample standard deviation with denominator n - 1.
    const sampleMean = nistLotteryUnivariateExample.certifiedSampleMean;
    const sumSquaredDeviations = nistLotteryUnivariateExample.values.reduce(
      (sum, value) => sum + (value - sampleMean) ** 2,
      0,
    );
    const sampleStandardDeviation = Math.sqrt(
      sumSquaredDeviations / (nistLotteryUnivariateExample.values.length - 1),
    );

    expect(sampleStandardDeviation).toBeCloseTo(
      nistLotteryUnivariateExample.certifiedSampleStandardDeviation,
      12,
    );
  });

  it("matches NIST Lottery certified lag-1 autocorrelation", () => {
    // Source: NIST StRD Lottery reports the certified first-order autocorrelation coefficient.
    const sampleMean = nistLotteryUnivariateExample.certifiedSampleMean;
    const centeredValues = nistLotteryUnivariateExample.values.map(
      (value) => value - sampleMean,
    );
    const laggedProductSum = centeredValues
      .slice(1)
      .reduce((sum, value, index) => sum + value * centeredValues[index]!, 0);
    const squaredDeviationSum = centeredValues.reduce(
      (sum, value) => sum + value ** 2,
      0,
    );
    const autocorrelation = laggedProductSum / squaredDeviationSum;

    expect(autocorrelation).toBeCloseTo(
      nistLotteryUnivariateExample.certifiedLagOneAutocorrelation,
      12,
    );
  });

  it("summarizes BLS annual income and expenditure series without arithmetic drift", async () => {
    // Source: BLS Consumer Expenditure tables publish average income and expenditure rows.
    const months = blsAnnualIncomeAndExpenditureSeries.map((entry) => ({
      activity: -entry.expenditureMilliunits,
      budgeted: entry.expenditureMilliunits,
      deleted: false,
      income: entry.incomeMilliunits,
      month: entry.month,
    }));
    const transactions = blsAnnualIncomeAndExpenditureSeries.flatMap(
      (entry) => [
        {
          amount: entry.incomeMilliunits,
          categoryName: "Inflow: Ready to Assign",
          date: `${entry.month.slice(0, 7)}-15`,
          deleted: false,
          id: `${entry.month}-income`,
          payeeId: "bls-income",
          payeeName: "BLS Income Before Taxes",
        },
        {
          amount: -entry.expenditureMilliunits,
          categoryName: "Average Annual Expenditures",
          date: `${entry.month.slice(0, 7)}-20`,
          deleted: false,
          id: `${entry.month}-expenditure`,
          payeeName: "BLS Average Annual Expenditures",
        },
      ],
    );
    const ynabClient = {
      listPlanMonths: async () => months,
      listTransactions: async () => transactions,
    } as unknown as YnabClient; // Test mock implements only range-summary methods.

    await expect(
      getIncomeSummary(ynabClient, {
        fromMonth: "2020-01-01",
        planId: "plan-1",
        toMonth: "2023-01-01",
      }),
    ).resolves.toMatchObject({
      income_total: "367592.00",
      average_monthly_income: "91898.00",
      median_monthly_income: "90717.50",
      volatility_percent: "18.99",
    });

    await expect(
      getCashFlowSummary(ynabClient, {
        fromMonth: "2020-01-01",
        planId: "plan-1",
        toMonth: "2023-01-01",
      }),
    ).resolves.toMatchObject({
      inflow: "367592.00",
      outflow: "278507.00",
      net_flow: "89085.00",
      assigned: "278507.00",
      spent: "278507.00",
      assigned_vs_spent: "0.00",
    });
  });

  it("rolls up BLS major expenditure categories by category, group, and payee", async () => {
    // Source: BLS Consumer Expenditure 2024 release table A publishes 2023 major component dollars.
    const categoryTotalMilliunits = blsMajorCategorySpending2023.reduce(
      (sum, entry) => sum + entry.amountMilliunits,
      0,
    );
    const ynabClient = {
      listCategories: async () => [
        {
          categories: blsMajorCategorySpending2023.map((entry) => ({
            deleted: false,
            hidden: false,
            id: entry.id,
            name: entry.name,
          })),
          deleted: false,
          hidden: false,
          id: "bls-major-components",
          name: "BLS Major Components",
        },
      ],
      listPlanMonths: async () => [
        {
          activity: -categoryTotalMilliunits,
          budgeted: categoryTotalMilliunits,
          deleted: false,
          month: "2023-01-01",
        },
      ],
      listTransactions: async () =>
        blsMajorCategorySpending2023.map((entry) => ({
          amount: -entry.amountMilliunits,
          categoryId: entry.id,
          categoryName: entry.name,
          date: "2023-01-20",
          deleted: false,
          id: `2023-${entry.id}`,
          payeeName: `BLS ${entry.name}`,
        })),
    } as unknown as YnabClient; // Test mock implements only spending-summary methods.

    await expect(
      getSpendingSummary(ynabClient, {
        fromMonth: "2023-01-01",
        planId: "plan-1",
        toMonth: "2023-01-01",
      }),
    ).resolves.toMatchObject({
      spent: "48595.00",
      average_transaction: "16198.33",
      top_categories: [
        { id: "housing", name: "Housing", amount: "25436.00" },
        {
          id: "transportation",
          name: "Transportation",
          amount: "13174.00",
        },
        { id: "food", name: "Food", amount: "9985.00" },
      ],
      top_category_groups: [
        {
          name: "BLS Major Components",
          amount: "48595.00",
          transaction_count: 3,
        },
      ],
      top_payees: [
        { name: "BLS Housing", amount: "25436.00" },
        { name: "BLS Transportation", amount: "13174.00" },
        { name: "BLS Food", amount: "9985.00" },
      ],
    });
  });

  it("calculates BLS food spending trend slope, peak, average, and correlation", async () => {
    // Source: BLS Consumer Expenditure annual tables publish food spending across 2020-2023.
    const ynabClient = {
      getPlanMonth: async (_planId: string, month: string) => ({
        categories: blsMajorCategorySpendingSeries
          .filter((entry) => entry.month === month)
          .map((entry) => ({
            activity: -entry.amountMilliunits,
            balance: 0,
            budgeted: entry.totalExpenditureMilliunits,
            categoryGroupName: "BLS Major Components",
            deleted: false,
            hidden: false,
            id: entry.id,
            name: entry.name,
          })),
        month,
      }),
      listCategories: async () => [
        {
          categories: [
            {
              deleted: false,
              hidden: false,
              id: "food",
              name: "Food",
            },
          ],
          deleted: false,
          hidden: false,
          id: "bls-major-components",
          name: "BLS Major Components",
        },
      ],
      listPlanMonths: async () =>
        blsAnnualIncomeAndExpenditureSeries.map((entry) => ({
          deleted: false,
          month: entry.month,
        })),
    } as unknown as YnabClient; // Test mock implements only trend-summary methods.

    await expect(
      getCategoryTrendSummary(ynabClient, {
        categoryId: "food",
        fromMonth: "2022-10-01",
        planId: "plan-1",
        toMonth: "2023-01-01",
      }),
    ).resolves.toMatchObject({
      average_spent: "8731.75",
      peak_month: "2023-01-01",
      spent_change: "2675.00",
      trend: {
        assigned_spent_correlation: "0.9995",
        spent_direction: "increasing",
        spent_slope_per_month: "907.90",
      },
      periods: [
        { month: "2022-10-01", spent: "7310.00" },
        { month: "2022-11-01", spent: "8289.00" },
        { month: "2022-12-01", spent: "9343.00" },
        { month: "2023-01-01", spent: "9985.00" },
      ],
    });
  });

  it("flags BLS food spending as an anomaly from a three-period published baseline", async () => {
    // Source: BLS Consumer Expenditure annual food values produce a z-score above 2 in 2023.
    const ynabClient = {
      getPlanMonth: async (_planId: string, month: string) => ({
        categories: blsMajorCategorySpendingSeries
          .filter((entry) => entry.month === month)
          .map((entry) => ({
            activity: -entry.amountMilliunits,
            balance: 0,
            deleted: false,
            hidden: false,
            id: entry.id,
            name: entry.name,
          })),
        month,
      }),
    } as unknown as YnabClient; // Test mock implements only anomaly-summary methods.

    await expect(
      getSpendingAnomalies(ynabClient, {
        baselineMonths: 3,
        latestMonth: "2023-01-01",
        minimumDifference: 100,
        planId: "plan-1",
        thresholdMultiplier: 1.1,
      }),
    ).resolves.toMatchObject({
      anomaly_count: 1,
      anomalies: [
        {
          baseline_average: "8314.00",
          category_id: "food",
          category_name: "Food",
          increase: "1671.00",
          increase_pct: "20.10",
          latest_spent: "9985.00",
          z_score: "2.0129",
        },
      ],
      baseline_month_count: 3,
      latest_month: "2023-01-01",
    });
  });
});
