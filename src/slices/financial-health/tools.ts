import { z } from "zod";

import type { YnabClient } from "../../platform/ynab/client.js";
import {
  defineTool,
  type SliceToolDefinition,
} from "../../shared/tool-definition.js";
import {
  dateFieldSchema,
  normalizedMonthFieldSchema,
  normalizedMonthSelectorSchema,
  planIdSchema,
  requiredIdSchema,
} from "../../shared/tool-inputs.js";
import {
  getBudgetCleanupSummary,
  getBudgetHealthSummary,
  getCashFlowSummary,
  getCashResilienceSummary,
  getCategoryTrendSummary,
  getFinancialHealthCheck,
  getFinancialSnapshot,
  getIncomeSummary,
  getMonthlyReview,
  getNetWorthTrajectory,
  getRecurringExpenseSummary,
  getSpendingAnomalies,
  getSpendingSummary,
  getUpcomingObligations,
} from "./service.js";

const detailLevelSchema = z
  .enum(["normal", "detailed"])
  .optional()
  .describe(
    "Controls bounded summary evidence: normal is compact; detailed includes capped supporting examples when available.",
  );
const topNDescription = " topN is capped at 10.";

export function getFinancialHealthToolDefinitions(
  ynabClient: YnabClient,
): SliceToolDefinition[] {
  return [
    defineTool({
      name: "ynab_get_financial_snapshot",
      title: "Get YNAB Financial Snapshot",
      description: `Returns a compact net worth, cash, debt, and assigned-versus-spent snapshot. Use for broad budget and financial questions.${topNDescription}`,
      inputSchema: {
        ...planIdSchema,
        month: normalizedMonthSelectorSchema.optional(),
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema,
      },
      execute: async (input) => getFinancialSnapshot(ynabClient, input),
    }),
    defineTool({
      name: "ynab_get_budget_health_summary",
      title: "Get YNAB Budget Health Summary",
      description: `Summarizes available funds, overspending, underfunding, and assigned versus spent. Use for broad budget health questions.${topNDescription}`,
      inputSchema: {
        ...planIdSchema,
        month: normalizedMonthSelectorSchema.optional(),
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema,
      },
      execute: async (input) => getBudgetHealthSummary(ynabClient, input),
    }),
    defineTool({
      name: "ynab_get_financial_health_check",
      title: "Get YNAB Financial Health Check",
      description: `Returns a compact score and top risk list across cash, cleanup, and budget stress. Use for broad budget risk questions.${topNDescription}`,
      inputSchema: {
        ...planIdSchema,
        month: normalizedMonthSelectorSchema.optional(),
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema,
      },
      execute: async (input) => getFinancialHealthCheck(ynabClient, input),
    }),
    defineTool({
      name: "ynab_get_monthly_review",
      title: "Get YNAB Monthly Review",
      description: `Returns a compact month summary with cash flow, budget health, top spending categories, and capped examples. Use for broad budget monthly review questions.${topNDescription}`,
      inputSchema: {
        ...planIdSchema,
        month: normalizedMonthSelectorSchema.optional(),
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema,
      },
      execute: async (input) => getMonthlyReview(ynabClient, input),
    }),
    defineTool({
      name: "ynab_get_cash_flow_summary",
      title: "Get YNAB Cash Flow Summary",
      description:
        "Returns inflow, outflow, net flow, and assigned-versus-spent across a month range. Use for broad budget cash-flow questions.",
      inputSchema: {
        ...planIdSchema,
        fromMonth: normalizedMonthFieldSchema.optional(),
        toMonth: normalizedMonthFieldSchema.optional(),
      },
      execute: async (input) => getCashFlowSummary(ynabClient, input),
    }),
    defineTool({
      name: "ynab_get_spending_summary",
      title: "Get YNAB Spending Summary",
      description: `Returns a compact spending summary with top categories, groups, payees, and capped examples across a month range. Use for broad budget spending questions.${topNDescription}`,
      inputSchema: {
        ...planIdSchema,
        fromMonth: normalizedMonthFieldSchema.optional(),
        toMonth: normalizedMonthFieldSchema.optional(),
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema,
      },
      execute: async (input) => getSpendingSummary(ynabClient, input),
    }),
    defineTool({
      name: "ynab_get_spending_anomalies",
      title: "Get YNAB Spending Anomalies",
      description: `Flags category spending spikes against a trailing monthly baseline with z-scores for anomaly strength. Use for broad budget anomaly questions.${topNDescription}`,
      inputSchema: {
        ...planIdSchema,
        month: normalizedMonthFieldSchema,
        baselineMonths: z.number().int().min(1).max(12).optional(),
        topN: z.number().int().min(1).max(10).optional(),
        thresholdMultiplier: z.number().min(1).optional(),
        minimumDifference: z.number().int().min(0).optional(),
        detailLevel: detailLevelSchema,
      },
      execute: async ({ month, ...input }) =>
        getSpendingAnomalies(ynabClient, {
          ...input,
          latestMonth: month,
        }),
    }),
    defineTool({
      name: "ynab_get_category_trend_summary",
      title: "Get YNAB Category Trend Summary",
      description:
        "Returns assigned, spent, available, regression slope, direction, and assigned-spent correlation trends for a category or category group across months. Use for broad budget trend questions.",
      inputSchema: {
        ...planIdSchema,
        fromMonth: normalizedMonthFieldSchema.optional(),
        toMonth: normalizedMonthFieldSchema.optional(),
        categoryId: requiredIdSchema.optional(),
        categoryGroupName: z.string().min(1).optional(),
      },
      execute: async (input) => getCategoryTrendSummary(ynabClient, input),
    }),
    defineTool({
      name: "ynab_get_cash_resilience_summary",
      title: "Get YNAB Cash Resilience Summary",
      description:
        "Estimates liquid cash coverage in months and days against recent spending and upcoming scheduled activity.",
      inputSchema: {
        ...planIdSchema,
        month: normalizedMonthFieldSchema.optional(),
        monthsBack: z.number().int().min(1).max(12).optional(),
        detailLevel: detailLevelSchema,
      },
      execute: async (input) => getCashResilienceSummary(ynabClient, input),
    }),
    defineTool({
      name: "ynab_get_upcoming_obligations",
      title: "Get YNAB Upcoming Obligations",
      description: `Summarizes upcoming scheduled inflows and outflows across 7, 14, and 30 day windows. Use for broad budget obligation questions.${topNDescription}`,
      inputSchema: {
        ...planIdSchema,
        asOfDate: dateFieldSchema.optional(),
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema,
      },
      execute: async (input) => getUpcomingObligations(ynabClient, input),
    }),
    defineTool({
      name: "ynab_get_income_summary",
      title: "Get YNAB Income Summary",
      description: `Returns a compact monthly income summary across a month range. Use for broad budget income questions.${topNDescription}`,
      inputSchema: {
        ...planIdSchema,
        fromMonth: normalizedMonthFieldSchema.optional(),
        toMonth: normalizedMonthFieldSchema.optional(),
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema,
      },
      execute: async (input) => getIncomeSummary(ynabClient, input),
    }),
    defineTool({
      name: "ynab_get_recurring_expense_summary",
      title: "Get YNAB Recurring Expense Summary",
      description: `Infers recurring expenses from transaction history and estimates monthly cost. Use for broad budget recurring expense questions.${topNDescription}`,
      inputSchema: {
        ...planIdSchema,
        fromDate: dateFieldSchema,
        toDate: dateFieldSchema,
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema,
      },
      execute: async (input) => getRecurringExpenseSummary(ynabClient, input),
    }),
    defineTool({
      name: "ynab_get_budget_cleanup_summary",
      title: "Get YNAB Budget Cleanup Summary",
      description: `Returns a compact cleanup punch-list for uncategorized, unapproved, uncleared, and overspent items. Use for broad budget cleanup questions.${topNDescription}`,
      inputSchema: {
        ...planIdSchema,
        month: normalizedMonthSelectorSchema.optional(),
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema,
      },
      execute: async (input) => getBudgetCleanupSummary(ynabClient, input),
    }),
    defineTool({
      name: "ynab_get_net_worth_trajectory",
      title: "Get YNAB Net Worth Trajectory",
      description:
        "Returns a month-by-month net worth trajectory with liquid cash and debt. Use for broad budget net-worth questions.",
      inputSchema: {
        ...planIdSchema,
        fromMonth: normalizedMonthFieldSchema.optional(),
        toMonth: normalizedMonthFieldSchema.optional(),
      },
      execute: async (input) => getNetWorthTrajectory(ynabClient, input),
    }),
  ];
}
