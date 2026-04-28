import { z } from "zod";

import type { YnabClient } from "../../platform/ynab/client.js";
import type { SliceToolDefinition } from "../../shared/tool-definition.js";
import {
  getBudgetCleanupSummary,
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
  getUpcomingObligations
} from "./service.js";

const detailLevelSchema = z.enum(["brief", "normal", "detailed"]);

export function getFinancialHealthToolDefinitions(ynabClient: YnabClient): SliceToolDefinition[] {
  return [
    {
      name: "ynab_get_financial_snapshot",
      title: "Get YNAB Financial Snapshot",
      description: "Returns a compact net worth, cash, debt, and assigned-versus-spent snapshot. Use for broad budget and financial questions.",
      inputSchema: {
        planId: z.string().optional(),
        month: z.string().optional(),
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema.optional()
      },
      execute: async (input) => getFinancialSnapshot(ynabClient, input)
    },
    {
      name: "ynab_get_budget_health_summary",
      title: "Get YNAB Budget Health Summary",
      description: "Summarizes available funds, overspending, underfunding, and assigned versus spent. Use for broad budget health questions.",
      inputSchema: {
        planId: z.string().optional(),
        month: z.string().optional(),
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema.optional()
      },
      execute: async (input) => getBudgetHealthSummary(ynabClient, input)
    },
    {
      name: "ynab_get_financial_health_check",
      title: "Get YNAB Financial Health Check",
      description: "Returns a compact score and top risk list across cash, cleanup, and budget stress. Use for broad budget risk questions.",
      inputSchema: {
        planId: z.string().optional(),
        month: z.string().optional(),
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema.optional()
      },
      execute: async (input) => getFinancialHealthCheck(ynabClient, input)
    },
    {
      name: "ynab_get_monthly_review",
      title: "Get YNAB Monthly Review",
      description: "Returns a compact month summary with cash flow, budget health, top spending categories, and capped examples. Use for broad budget monthly review questions.",
      inputSchema: {
        planId: z.string().optional(),
        month: z.string().optional(),
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema.optional()
      },
      execute: async (input) => getMonthlyReview(ynabClient, input)
    },
    {
      name: "ynab_get_cash_flow_summary",
      title: "Get YNAB Cash Flow Summary",
      description: "Returns inflow, outflow, net flow, and assigned-versus-spent across a month range. Use for broad budget cash-flow questions.",
      inputSchema: {
        planId: z.string().optional(),
        fromMonth: z.string().optional(),
        toMonth: z.string().optional(),
        detailLevel: detailLevelSchema.optional()
      },
      execute: async (input) => getCashFlowSummary(ynabClient, input)
    },
    {
      name: "ynab_get_spending_summary",
      title: "Get YNAB Spending Summary",
      description: "Returns a compact spending summary with top categories, groups, payees, and capped examples across a month range. Use for broad budget spending questions.",
      inputSchema: {
        planId: z.string().optional(),
        fromMonth: z.string().optional(),
        toMonth: z.string().optional(),
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema.optional()
      },
      execute: async (input) => getSpendingSummary(ynabClient, input)
    },
    {
      name: "ynab_get_spending_anomalies",
      title: "Get YNAB Spending Anomalies",
      description: "Flags category spending spikes against a trailing monthly baseline. Use for broad budget anomaly questions.",
      inputSchema: {
        planId: z.string().optional(),
        latestMonth: z.string().min(1),
        baselineMonths: z.number().int().min(1).max(12).optional(),
        topN: z.number().int().min(1).max(10).optional(),
        thresholdMultiplier: z.number().min(1).optional(),
        minimumDifference: z.number().int().min(0).optional(),
        detailLevel: detailLevelSchema.optional()
      },
      execute: async (input) => getSpendingAnomalies(ynabClient, input)
    },
    {
      name: "ynab_get_category_trend_summary",
      title: "Get YNAB Category Trend Summary",
      description: "Returns assigned, spent, and available trends for a category or category group across months. Use for broad budget trend questions.",
      inputSchema: {
        planId: z.string().optional(),
        fromMonth: z.string().optional(),
        toMonth: z.string().optional(),
        categoryId: z.string().optional(),
        categoryGroupName: z.string().optional(),
        detailLevel: detailLevelSchema.optional()
      },
      execute: async (input) => getCategoryTrendSummary(ynabClient, input)
    },
    {
      name: "ynab_get_cash_runway",
      title: "Get YNAB Cash Runway",
      description: "Estimates how many days liquid cash can cover recent outflows. Use for broad budget runway questions.",
      inputSchema: {
        planId: z.string().optional(),
        asOfMonth: z.string().min(1),
        monthsBack: z.number().int().min(1).max(12).optional(),
        detailLevel: detailLevelSchema.optional()
      },
      execute: async (input) => getCashRunway(ynabClient, input)
    },
    {
      name: "ynab_get_upcoming_obligations",
      title: "Get YNAB Upcoming Obligations",
      description: "Summarizes upcoming scheduled inflows and outflows across 7, 14, and 30 day windows. Use for broad budget obligation questions.",
      inputSchema: {
        planId: z.string().optional(),
        asOfDate: z.string().optional(),
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema.optional()
      },
      execute: async (input) => getUpcomingObligations(ynabClient, input)
    },
    {
      name: "ynab_get_income_summary",
      title: "Get YNAB Income Summary",
      description: "Returns a compact monthly income summary across a month range. Use for broad budget income questions.",
      inputSchema: {
        planId: z.string().optional(),
        fromMonth: z.string().optional(),
        toMonth: z.string().optional(),
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema.optional()
      },
      execute: async (input) => getIncomeSummary(ynabClient, input)
    },
    {
      name: "ynab_get_recurring_expense_summary",
      title: "Get YNAB Recurring Expense Summary",
      description: "Infers recurring expenses from transaction history and estimates monthly cost. Use for broad budget recurring expense questions.",
      inputSchema: {
        planId: z.string().optional(),
        fromDate: z.string().min(1),
        toDate: z.string().min(1),
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema.optional()
      },
      execute: async (input) => getRecurringExpenseSummary(ynabClient, input)
    },
    {
      name: "ynab_get_emergency_fund_coverage",
      title: "Get YNAB Emergency Fund Coverage",
      description: "Estimates how many months of recent spending liquid cash can cover. Use for broad budget emergency fund questions.",
      inputSchema: {
        planId: z.string().optional(),
        asOfMonth: z.string().min(1),
        monthsBack: z.number().int().min(1).max(12).optional(),
        detailLevel: detailLevelSchema.optional()
      },
      execute: async (input) => getEmergencyFundCoverage(ynabClient, input)
    },
    {
      name: "ynab_get_goal_progress_summary",
      title: "Get YNAB Goal Progress Summary",
      description: "Summarizes goal progress, underfunded goals, and top goal gaps. Use for broad budget goal questions.",
      inputSchema: {
        planId: z.string().optional(),
        month: z.string().optional(),
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema.optional()
      },
      execute: async (input) => getGoalProgressSummary(ynabClient, input)
    },
    {
      name: "ynab_get_debt_summary",
      title: "Get YNAB Debt Summary",
      description: "Summarizes debt balances, concentration, and cash pressure from debt accounts. Use for broad budget debt questions.",
      inputSchema: {
        planId: z.string().optional(),
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema.optional()
      },
      execute: async (input) => getDebtSummary(ynabClient, input)
    },
    {
      name: "ynab_get_budget_cleanup_summary",
      title: "Get YNAB Budget Cleanup Summary",
      description: "Returns a compact cleanup punch-list for uncategorized, unapproved, uncleared, and overspent items. Use for broad budget cleanup questions.",
      inputSchema: {
        planId: z.string().optional(),
        month: z.string().optional(),
        topN: z.number().int().min(1).max(10).optional(),
        detailLevel: detailLevelSchema.optional()
      },
      execute: async (input) => getBudgetCleanupSummary(ynabClient, input)
    },
    {
      name: "ynab_get_net_worth_trajectory",
      title: "Get YNAB Net Worth Trajectory",
      description: "Returns a month-by-month net worth trajectory with liquid cash and debt. Use for broad budget net-worth questions.",
      inputSchema: {
        planId: z.string().optional(),
        fromMonth: z.string().optional(),
        toMonth: z.string().optional(),
        detailLevel: detailLevelSchema.optional()
      },
      execute: async (input) => getNetWorthTrajectory(ynabClient, input)
    }
  ];
}
