import { z } from "zod";

import type { YnabClient } from "../../platform/ynab/client.js";
import {
  defineTool,
  type SliceToolDefinition,
} from "../../shared/tool-definition.js";
import {
  dateFieldSchema,
  monthFieldSchema,
  monthSelectorSchema,
  planIdSchema,
  requiredIdSchema,
} from "../../shared/tool-inputs.js";
import {
  explainMonthDelta,
  getBudgetCleanupSummary,
  getBudgetChangeDigest,
  getBudgetHealthSummary,
  getCashFlowSummary,
  getCashRunway,
  getCategoryTrendSummary,
  getDebtSummary,
  getEmergencyFundCoverage,
  getFinancialHealthCheck,
  getFinancialSnapshot,
  getGoalProgressSummary,
  getIncomeSummary,
  getMonthlyReview,
  getNetWorthTrajectory,
  getRecurringExpenseSummary,
  getSpendingAnomalies,
  getSpendingSummary,
  getUpcomingObligations,
} from "./service.js";

const detailLevelSchema = z.enum(["brief", "normal", "detailed"]);

export function getFinancialHealthToolDefinitions(
  ynabClient: YnabClient,
): SliceToolDefinition[] {
  return [
    defineTool({
      name: "ynab_explain_month_delta",
      title: "Explain YNAB Month Delta",
      description:
        "Explains what changed between two budget months, including income, spending, category deltas, and transaction evidence.",
      inputSchema: {
        ...planIdSchema,
        baselineMonth: monthFieldSchema,
        comparisonMonth: monthFieldSchema,
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema.optional(),
      },
      execute: async (input) => explainMonthDelta(ynabClient, input),
    }),
    defineTool({
      name: "ynab_get_budget_change_digest",
      title: "Get YNAB Budget Change Digest",
      description:
        "Summarizes what changed in a budget month and what needs attention. Use for broad budget review questions like what changed, what matters, or what to inspect next.",
      inputSchema: {
        ...planIdSchema,
        month: monthSelectorSchema.optional(),
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema.optional(),
      },
      execute: async (input) => getBudgetChangeDigest(ynabClient, input),
    }),
    defineTool({
      name: "ynab_get_financial_snapshot",
      title: "Get YNAB Financial Snapshot",
      description:
        "Returns a compact net worth, cash, debt, and assigned-versus-spent snapshot. Use for broad budget and financial questions.",
      inputSchema: {
        ...planIdSchema,
        month: monthSelectorSchema.optional(),
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema.optional(),
      },
      execute: async (input) => getFinancialSnapshot(ynabClient, input),
    }),
    defineTool({
      name: "ynab_get_budget_health_summary",
      title: "Get YNAB Budget Health Summary",
      description:
        "Summarizes available funds, overspending, underfunding, and assigned versus spent. Use for broad budget health questions.",
      inputSchema: {
        ...planIdSchema,
        month: monthSelectorSchema.optional(),
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema.optional(),
      },
      execute: async (input) => getBudgetHealthSummary(ynabClient, input),
    }),
    defineTool({
      name: "ynab_get_financial_health_check",
      title: "Get YNAB Financial Health Check",
      description:
        "Returns a compact score and top risk list across cash, cleanup, and budget stress. Use for broad budget risk questions.",
      inputSchema: {
        ...planIdSchema,
        month: monthSelectorSchema.optional(),
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema.optional(),
      },
      execute: async (input) => getFinancialHealthCheck(ynabClient, input),
    }),
    defineTool({
      name: "ynab_get_monthly_review",
      title: "Get YNAB Monthly Review",
      description:
        "Returns a compact month summary with cash flow, budget health, top spending categories, and capped examples. Use for broad budget monthly review questions.",
      inputSchema: {
        ...planIdSchema,
        month: monthSelectorSchema.optional(),
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema.optional(),
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
        fromMonth: monthFieldSchema.optional(),
        toMonth: monthFieldSchema.optional(),
        detailLevel: detailLevelSchema.optional(),
      },
      execute: async (input) => getCashFlowSummary(ynabClient, input),
    }),
    defineTool({
      name: "ynab_get_spending_summary",
      title: "Get YNAB Spending Summary",
      description:
        "Returns a compact spending summary with top categories, groups, payees, and capped examples across a month range. Use for broad budget spending questions.",
      inputSchema: {
        ...planIdSchema,
        fromMonth: monthFieldSchema.optional(),
        toMonth: monthFieldSchema.optional(),
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema.optional(),
      },
      execute: async (input) => getSpendingSummary(ynabClient, input),
    }),
    defineTool({
      name: "ynab_get_spending_anomalies",
      title: "Get YNAB Spending Anomalies",
      description:
        "Flags category spending spikes against a trailing monthly baseline. Use for broad budget anomaly questions.",
      inputSchema: {
        ...planIdSchema,
        latestMonth: monthFieldSchema,
        baselineMonths: z.number().int().min(1).max(12).optional(),
        topN: z.number().int().min(1).max(10).optional(),
        thresholdMultiplier: z.number().min(1).optional(),
        minimumDifference: z.number().int().min(0).optional(),
        detailLevel: detailLevelSchema.optional(),
      },
      execute: async (input) => getSpendingAnomalies(ynabClient, input),
    }),
    defineTool({
      name: "ynab_get_category_trend_summary",
      title: "Get YNAB Category Trend Summary",
      description:
        "Returns assigned, spent, and available trends for a category or category group across months. Use for broad budget trend questions.",
      inputSchema: {
        ...planIdSchema,
        fromMonth: monthFieldSchema.optional(),
        toMonth: monthFieldSchema.optional(),
        categoryId: requiredIdSchema.optional(),
        categoryGroupName: z.string().min(1).optional(),
        detailLevel: detailLevelSchema.optional(),
      },
      execute: async (input) => getCategoryTrendSummary(ynabClient, input),
    }),
    defineTool({
      name: "ynab_get_cash_runway",
      title: "Get YNAB Cash Runway",
      description:
        "Estimates how many days liquid cash can cover recent outflows. Use for broad budget runway questions.",
      inputSchema: {
        ...planIdSchema,
        asOfMonth: monthFieldSchema,
        monthsBack: z.number().int().min(1).max(12).optional(),
        detailLevel: detailLevelSchema.optional(),
      },
      execute: async (input) => getCashRunway(ynabClient, input),
    }),
    defineTool({
      name: "ynab_get_upcoming_obligations",
      title: "Get YNAB Upcoming Obligations",
      description:
        "Summarizes upcoming scheduled inflows and outflows across 7, 14, and 30 day windows. Use for broad budget obligation questions.",
      inputSchema: {
        ...planIdSchema,
        asOfDate: dateFieldSchema.optional(),
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema.optional(),
      },
      execute: async (input) => getUpcomingObligations(ynabClient, input),
    }),
    defineTool({
      name: "ynab_get_income_summary",
      title: "Get YNAB Income Summary",
      description:
        "Returns a compact monthly income summary across a month range. Use for broad budget income questions.",
      inputSchema: {
        ...planIdSchema,
        fromMonth: monthFieldSchema.optional(),
        toMonth: monthFieldSchema.optional(),
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema.optional(),
      },
      execute: async (input) => getIncomeSummary(ynabClient, input),
    }),
    defineTool({
      name: "ynab_get_recurring_expense_summary",
      title: "Get YNAB Recurring Expense Summary",
      description:
        "Infers recurring expenses from transaction history and estimates monthly cost. Use for broad budget recurring expense questions.",
      inputSchema: {
        ...planIdSchema,
        fromDate: dateFieldSchema,
        toDate: dateFieldSchema,
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema.optional(),
      },
      execute: async (input) => getRecurringExpenseSummary(ynabClient, input),
    }),
    defineTool({
      name: "ynab_get_emergency_fund_coverage",
      title: "Get YNAB Emergency Fund Coverage",
      description:
        "Estimates how many months of recent spending liquid cash can cover. Use for broad budget emergency fund questions.",
      inputSchema: {
        ...planIdSchema,
        asOfMonth: monthFieldSchema,
        monthsBack: z.number().int().min(1).max(12).optional(),
        detailLevel: detailLevelSchema.optional(),
      },
      execute: async (input) => getEmergencyFundCoverage(ynabClient, input),
    }),
    defineTool({
      name: "ynab_get_goal_progress_summary",
      title: "Get YNAB Goal Progress Summary",
      description:
        "Summarizes goal progress, underfunded goals, and top goal gaps. Use for broad budget goal questions.",
      inputSchema: {
        ...planIdSchema,
        month: monthSelectorSchema.optional(),
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema.optional(),
      },
      execute: async (input) => getGoalProgressSummary(ynabClient, input),
    }),
    defineTool({
      name: "ynab_get_debt_summary",
      title: "Get YNAB Debt Summary",
      description:
        "Summarizes debt balances, concentration, and cash pressure from debt accounts. Use for broad budget debt questions.",
      inputSchema: {
        ...planIdSchema,
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema.optional(),
      },
      execute: async (input) => getDebtSummary(ynabClient, input),
    }),
    defineTool({
      name: "ynab_get_budget_cleanup_summary",
      title: "Get YNAB Budget Cleanup Summary",
      description:
        "Returns a compact cleanup punch-list for uncategorized, unapproved, uncleared, and overspent items. Use for broad budget cleanup questions.",
      inputSchema: {
        ...planIdSchema,
        month: monthSelectorSchema.optional(),
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema.optional(),
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
        fromMonth: monthFieldSchema.optional(),
        toMonth: monthFieldSchema.optional(),
        detailLevel: detailLevelSchema.optional(),
      },
      execute: async (input) => getNetWorthTrajectory(ynabClient, input),
    }),
  ];
}
