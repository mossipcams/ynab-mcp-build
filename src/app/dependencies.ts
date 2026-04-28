import { createYnabClient, type YnabClient } from "../platform/ynab/client.js";
import type { InitialPopulationInput, InitialPopulationResult } from "../platform/ynab/read-model/initial-population-service.js";
import type { AppEnv } from "../shared/env.js";

export type AppDependencies = {
  createId?: () => string;
  initialPopulationService?: {
    populate(input?: InitialPopulationInput): Promise<InitialPopulationResult>;
  };
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
      async getUser() {
        throw new Error("YNAB access token is not configured.");
      },
      async listPlans() {
        throw new Error("YNAB access token is not configured.");
      },
      async getPlan() {
        throw new Error("YNAB access token is not configured.");
      },
      async listCategories() {
        throw new Error("YNAB access token is not configured.");
      },
      async getCategory() {
        throw new Error("YNAB access token is not configured.");
      },
      async getMonthCategory() {
        throw new Error("YNAB access token is not configured.");
      },
      async getPlanSettings() {
        throw new Error("YNAB access token is not configured.");
      },
      async listPlanMonths() {
        throw new Error("YNAB access token is not configured.");
      },
      async getPlanMonth() {
        throw new Error("YNAB access token is not configured.");
      },
      async listAccounts() {
        throw new Error("YNAB access token is not configured.");
      },
      async getAccount() {
        throw new Error("YNAB access token is not configured.");
      },
      async listTransactions() {
        throw new Error("YNAB access token is not configured.");
      },
      async listTransactionsByAccount() {
        throw new Error("YNAB access token is not configured.");
      },
      async listTransactionsByCategory() {
        throw new Error("YNAB access token is not configured.");
      },
      async listTransactionsByPayee() {
        throw new Error("YNAB access token is not configured.");
      },
      async getTransaction() {
        throw new Error("YNAB access token is not configured.");
      },
      async listScheduledTransactions() {
        throw new Error("YNAB access token is not configured.");
      },
      async getScheduledTransaction() {
        throw new Error("YNAB access token is not configured.");
      },
      async listPayees() {
        throw new Error("YNAB access token is not configured.");
      },
      async getPayee() {
        throw new Error("YNAB access token is not configured.");
      },
      async listPayeeLocations() {
        throw new Error("YNAB access token is not configured.");
      },
      async getPayeeLocation() {
        throw new Error("YNAB access token is not configured.");
      },
      async getPayeeLocationsByPayee() {
        throw new Error("YNAB access token is not configured.");
      }
    };
  }

  return createYnabClient({
    accessToken: env.ynabAccessToken,
    baseUrl: env.ynabApiBaseUrl
  });
}
