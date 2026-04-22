import type { YnabClient } from "../platform/ynab/client.js";

export async function resolvePlanId(ynabClient: YnabClient, planId: string | undefined) {
  const explicitPlanId = planId?.trim();

  if (explicitPlanId) {
    return explicitPlanId;
  }

  const plans = await ynabClient.listPlans();

  if (plans.defaultPlan?.id) {
    return plans.defaultPlan.id;
  }

  const firstPlanId = plans.plans[0]?.id;

  if (firstPlanId) {
    return firstPlanId;
  }

  throw new Error("No YNAB plan is available.");
}
