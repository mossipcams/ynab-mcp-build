import { createDurableObjectOAuthStore } from "../durable-objects/oauth-state-client.js";
import { createYnabClient, type YnabClient } from "../platform/ynab/client.js";
import { createOAuthCore } from "../oauth/core/auth.js";
import { generateOAuthTokenId } from "../oauth/core/token-id.js";
import type { OAuthStore } from "../oauth/core/store.js";
import type { AppEnv } from "../shared/env.js";

export class OAuthConfigurationError extends Error {
  constructor(message = "OAuth state storage is not configured.") {
    super(message);
    this.name = "OAuthConfigurationError";
  }
}

export type AppDependencies = {
  createId?: () => string;
  now?: () => number;
  oauthStore?: OAuthStore;
  ynabClient?: YnabClient;
};

export function resolveYnabClient(env: AppEnv, dependencies: AppDependencies): YnabClient {
  if (dependencies.ynabClient) {
    return dependencies.ynabClient;
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

export function resolveOAuthCore(env: AppEnv, dependencies: AppDependencies) {
  if (!env.oauthEnabled || !env.publicUrl) {
    return undefined;
  }

  const store = dependencies.oauthStore
    ? dependencies.oauthStore
    : env.oauthStateNamespace
      ? createDurableObjectOAuthStore(env.oauthStateNamespace.get(env.oauthStateNamespace.idFromName("oauth-state")))
      : undefined;

  if (!store) {
    throw new OAuthConfigurationError();
  }

  return createOAuthCore({
    createId: dependencies.createId ?? generateOAuthTokenId,
    issuer: env.publicUrl,
    jwtSigningKey: env.jwtSigningKey!,
    now: dependencies.now ?? (() => Date.now()),
    protectedResource: env.publicUrl,
    scopesSupported: ["mcp"],
    store
  });
}
