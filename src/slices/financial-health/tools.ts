import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { YnabClient } from "../../platform/ynab/client.js";
import { toErrorResult, toTextResult } from "../../shared/results.js";
import {
  getBudgetCleanupSummary,
  getCashFlowSummary,
  getCashRunway,
  getCategoryTrendSummary,
  getDebtSummary,
  getBudgetHealthSummary,
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

export function registerFinancialHealthTools(server: McpServer, ynabClient: YnabClient) {
  server.registerTool(
    "ynab_get_financial_snapshot",
    {
      title: "Get YNAB Financial Snapshot",
      description: "Returns a compact net worth, cash, debt, and assigned-versus-spent snapshot.",
      inputSchema: {
        planId: z.string().optional(),
        month: z.string().optional(),
        topN: z.number().int().min(1).max(10).optional()
      }
    },
    async (input) => {
      try {
        return toTextResult(await getFinancialSnapshot(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_budget_health_summary",
    {
      title: "Get YNAB Budget Health Summary",
      description: "Summarizes available funds, overspending, underfunding, and assigned versus spent.",
      inputSchema: {
        planId: z.string().optional(),
        month: z.string().optional(),
        topN: z.number().int().min(1).max(10).optional()
      }
    },
    async (input) => {
      try {
        return toTextResult(await getBudgetHealthSummary(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_financial_health_check",
    {
      title: "Get YNAB Financial Health Check",
      description: "Returns a compact score and top risk list across cash, cleanup, and budget stress.",
      inputSchema: {
        planId: z.string().optional(),
        month: z.string().optional(),
        topN: z.number().int().min(1).max(10).optional()
      }
    },
    async (input) => {
      try {
        return toTextResult(await getFinancialHealthCheck(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_monthly_review",
    {
      title: "Get YNAB Monthly Review",
      description: "Returns a compact month summary with cash flow, budget health, and top spending categories.",
      inputSchema: {
        planId: z.string().optional(),
        month: z.string().optional(),
        topN: z.number().int().min(1).max(10).optional()
      }
    },
    async (input) => {
      try {
        return toTextResult(await getMonthlyReview(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_cash_flow_summary",
    {
      title: "Get YNAB Cash Flow Summary",
      description: "Returns inflow, outflow, net flow, and assigned-versus-spent across a month range.",
      inputSchema: {
        planId: z.string().optional(),
        fromMonth: z.string().optional(),
        toMonth: z.string().optional()
      }
    },
    async (input) => {
      try {
        return toTextResult(await getCashFlowSummary(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_spending_summary",
    {
      title: "Get YNAB Spending Summary",
      description: "Returns a compact spending summary with top categories, groups, and payees across a month range.",
      inputSchema: {
        planId: z.string().optional(),
        fromMonth: z.string().optional(),
        toMonth: z.string().optional(),
        topN: z.number().int().min(1).max(10).optional()
      }
    },
    async (input) => {
      try {
        return toTextResult(await getSpendingSummary(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_spending_anomalies",
    {
      title: "Get YNAB Spending Anomalies",
      description: "Flags category spending spikes against a trailing monthly baseline.",
      inputSchema: {
        planId: z.string().optional(),
        latestMonth: z.string().min(1),
        baselineMonths: z.number().int().min(1).max(12).optional(),
        topN: z.number().int().min(1).max(10).optional(),
        thresholdMultiplier: z.number().min(1).optional(),
        minimumDifference: z.number().int().min(0).optional()
      }
    },
    async (input) => {
      try {
        return toTextResult(await getSpendingAnomalies(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_category_trend_summary",
    {
      title: "Get YNAB Category Trend Summary",
      description: "Returns assigned, spent, and available trends for a category or category group across months.",
      inputSchema: {
        planId: z.string().optional(),
        fromMonth: z.string().optional(),
        toMonth: z.string().optional(),
        categoryId: z.string().optional(),
        categoryGroupName: z.string().optional()
      }
    },
    async (input) => {
      try {
        return toTextResult(await getCategoryTrendSummary(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_cash_runway",
    {
      title: "Get YNAB Cash Runway",
      description: "Estimates how many days liquid cash can cover recent outflows.",
      inputSchema: {
        planId: z.string().optional(),
        asOfMonth: z.string().min(1),
        monthsBack: z.number().int().min(1).max(12).optional()
      }
    },
    async (input) => {
      try {
        return toTextResult(await getCashRunway(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_upcoming_obligations",
    {
      title: "Get YNAB Upcoming Obligations",
      description: "Summarizes upcoming scheduled inflows and outflows across 7, 14, and 30 day windows.",
      inputSchema: {
        planId: z.string().optional(),
        asOfDate: z.string().optional(),
        topN: z.number().int().min(1).max(10).optional()
      }
    },
    async (input) => {
      try {
        return toTextResult(await getUpcomingObligations(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_income_summary",
    {
      title: "Get YNAB Income Summary",
      description: "Returns a compact monthly income summary across a month range.",
      inputSchema: {
        planId: z.string().optional(),
        fromMonth: z.string().optional(),
        toMonth: z.string().optional(),
        topN: z.number().int().min(1).max(10).optional()
      }
    },
    async (input) => {
      try {
        return toTextResult(await getIncomeSummary(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_recurring_expense_summary",
    {
      title: "Get YNAB Recurring Expense Summary",
      description: "Infers recurring expenses from transaction history and estimates monthly cost.",
      inputSchema: {
        planId: z.string().optional(),
        fromDate: z.string().min(1),
        toDate: z.string().min(1),
        topN: z.number().int().min(1).max(10).optional()
      }
    },
    async (input) => {
      try {
        return toTextResult(await getRecurringExpenseSummary(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_emergency_fund_coverage",
    {
      title: "Get YNAB Emergency Fund Coverage",
      description: "Estimates how many months of recent spending liquid cash can cover.",
      inputSchema: {
        planId: z.string().optional(),
        asOfMonth: z.string().min(1),
        monthsBack: z.number().int().min(1).max(12).optional()
      }
    },
    async (input) => {
      try {
        return toTextResult(await getEmergencyFundCoverage(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_goal_progress_summary",
    {
      title: "Get YNAB Goal Progress Summary",
      description: "Summarizes goal progress, underfunded goals, and top goal gaps.",
      inputSchema: {
        planId: z.string().optional(),
        month: z.string().optional(),
        topN: z.number().int().min(1).max(10).optional()
      }
    },
    async (input) => {
      try {
        return toTextResult(await getGoalProgressSummary(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_debt_summary",
    {
      title: "Get YNAB Debt Summary",
      description: "Summarizes debt balances, concentration, and cash pressure from debt accounts.",
      inputSchema: {
        planId: z.string().optional(),
        topN: z.number().int().min(1).max(10).optional()
      }
    },
    async (input) => {
      try {
        return toTextResult(await getDebtSummary(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_budget_cleanup_summary",
    {
      title: "Get YNAB Budget Cleanup Summary",
      description: "Returns a compact cleanup punch-list for uncategorized, unapproved, uncleared, and overspent items.",
      inputSchema: {
        planId: z.string().optional(),
        month: z.string().optional(),
        topN: z.number().int().min(1).max(10).optional()
      }
    },
    async (input) => {
      try {
        return toTextResult(await getBudgetCleanupSummary(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "ynab_get_net_worth_trajectory",
    {
      title: "Get YNAB Net Worth Trajectory",
      description: "Returns a month-by-month net worth trajectory with liquid cash and debt.",
      inputSchema: {
        planId: z.string().optional(),
        fromMonth: z.string().optional(),
        toMonth: z.string().optional()
      }
    },
    async (input) => {
      try {
        return toTextResult(await getNetWorthTrajectory(ynabClient, input));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );
}
