import type { YnabClient } from "../platform/ynab/client.js";

const defaultPlanIdByClient = new WeakMap<YnabClient, Promise<string>>();

function resolveDefaultPlanId(ynabClient: YnabClient) {
  const cachedPlanId = defaultPlanIdByClient.get(ynabClient);

  if (cachedPlanId) {
    return cachedPlanId;
  }

  const planId = ynabClient.listPlans()
    .then((plans) => {
      if (plans.defaultPlan?.id) {
        return plans.defaultPlan.id;
      }

      const firstPlanId = plans.plans[0]?.id;

      if (firstPlanId) {
        return firstPlanId;
      }

      throw new Error("No YNAB plan is available.");
    })
    .catch((error) => {
      defaultPlanIdByClient.delete(ynabClient);
      throw error;
    });

  defaultPlanIdByClient.set(ynabClient, planId);

  return planId;
}

export async function resolvePlanId(ynabClient: YnabClient, planId: string | undefined) {
  const explicitPlanId = planId?.trim();

  if (explicitPlanId) {
    return explicitPlanId;
  }

  return resolveDefaultPlanId(ynabClient);
}
