import type { YnabClient } from "../platform/ynab/client.js";
import type { YnabDefaultPlan, YnabPlanList } from "../platform/ynab/client.js";

const defaultPlanIdByClient = new WeakMap<YnabClient, Promise<string>>();

export function getKnownDefaultPlan(
  plans: YnabPlanList,
): YnabDefaultPlan | null {
  if (plans.defaultPlan?.id) {
    return plans.defaultPlan;
  }

  if (plans.plans.length === 1) {
    const [onlyPlan] = plans.plans;

    if (!onlyPlan) {
      return null;
    }

    return {
      id: onlyPlan.id,
      name: onlyPlan.name,
    };
  }

  return null;
}

function resolveDefaultPlanId(ynabClient: YnabClient) {
  const cachedPlanId = defaultPlanIdByClient.get(ynabClient);

  if (cachedPlanId) {
    return cachedPlanId;
  }

  const planId = ynabClient
    .listPlans()
    .then((plans) => {
      const defaultPlan = getKnownDefaultPlan(plans);

      if (defaultPlan) {
        return defaultPlan.id;
      }

      throw new Error("No default YNAB plan is available.");
    })
    .catch((error: unknown) => {
      defaultPlanIdByClient.delete(ynabClient);
      throw error;
    });

  defaultPlanIdByClient.set(ynabClient, planId);

  return planId;
}

export async function resolvePlanId(
  ynabClient: YnabClient,
  planId: string | undefined,
) {
  const explicitPlanId = planId?.trim();

  if (explicitPlanId) {
    return explicitPlanId;
  }

  return resolveDefaultPlanId(ynabClient);
}
