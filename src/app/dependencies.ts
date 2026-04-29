import { createYnabClient, type YnabClient } from "../platform/ynab/client.js";
import type { AppEnv } from "../shared/env.js";

function rejectMissingYnabAccessToken(): Promise<never> {
  return Promise.reject(new Error("YNAB access token is not configured."));
}

export type AppDependencies = {
  createId?: () => string;
  now?: () => number;
  ynabClient?: YnabClient;
};

export function resolveYnabClient(env: AppEnv, dependencies: AppDependencies): YnabClient {
  const injectedYnabClient = dependencies.ynabClient;

  if (injectedYnabClient) {
    return injectedYnabClient;
  }

  if (!env.ynabAccessToken) {
    return {
      getUser: rejectMissingYnabAccessToken,
      listPlans: rejectMissingYnabAccessToken,
      getPlan: rejectMissingYnabAccessToken,
      listCategories: rejectMissingYnabAccessToken,
      getCategory: rejectMissingYnabAccessToken,
      getMonthCategory: rejectMissingYnabAccessToken,
      getPlanSettings: rejectMissingYnabAccessToken,
      listPlanMonths: rejectMissingYnabAccessToken,
      getPlanMonth: rejectMissingYnabAccessToken,
      listAccounts: rejectMissingYnabAccessToken,
      getAccount: rejectMissingYnabAccessToken,
      listTransactions: rejectMissingYnabAccessToken,
      listTransactionsByAccount: rejectMissingYnabAccessToken,
      listTransactionsByCategory: rejectMissingYnabAccessToken,
      listTransactionsByPayee: rejectMissingYnabAccessToken,
      getTransaction: rejectMissingYnabAccessToken,
      listScheduledTransactions: rejectMissingYnabAccessToken,
      getScheduledTransaction: rejectMissingYnabAccessToken,
      listPayees: rejectMissingYnabAccessToken,
      getPayee: rejectMissingYnabAccessToken,
      listPayeeLocations: rejectMissingYnabAccessToken,
      getPayeeLocation: rejectMissingYnabAccessToken,
      getPayeeLocationsByPayee: rejectMissingYnabAccessToken,
      listMoneyMovements: rejectMissingYnabAccessToken,
      listMoneyMovementGroups: rejectMissingYnabAccessToken
    };
  }

  return createYnabClient({
    accessToken: env.ynabAccessToken,
    baseUrl: env.ynabApiBaseUrl
  });
}
