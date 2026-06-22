import type { YnabClient, YnabPlanMonthDetail } from "../client.js";

type MonthBackfillClient = Pick<YnabClient, "getPlanMonth">;

type MonthBackfillRepository = {
  upsertMonths(input: {
    planId: string;
    months: YnabPlanMonthDetail[];
    syncedAt: string;
  }): Promise<{ monthCategoriesUpserted: number; monthsUpserted: number }>;
};

export type BackfillPlanMonthInput = {
  month: string;
  planId: string;
  readModelRepository: MonthBackfillRepository;
  syncedAt: string;
  ynabClient: MonthBackfillClient;
};

export async function backfillPlanMonth(input: BackfillPlanMonthInput) {
  const monthDetail = await input.ynabClient.getPlanMonth(
    input.planId,
    input.month,
  );
  const result = await input.readModelRepository.upsertMonths({
    months: [monthDetail],
    planId: input.planId,
    syncedAt: input.syncedAt,
  });

  return {
    categoryCount: monthDetail.categories?.length ?? 0,
    month: monthDetail.month,
    monthCategoriesUpserted: result.monthCategoriesUpserted,
    monthsUpserted: result.monthsUpserted,
    planId: input.planId,
  };
}
