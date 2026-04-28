import { mapTransactionRecord } from "./mappers.js";

export type YnabClientErrorCategory = "internal" | "rate_limit" | "upstream";

export class YnabClientError extends Error {
  category: YnabClientErrorCategory;
  retryable: boolean;

  constructor(message: string, category: YnabClientErrorCategory, retryable: boolean) {
    super(message);
    this.name = "YnabClientError";
    this.category = category;
    this.retryable = retryable;
  }
}

export type YnabPlanSummary = {
  id: string;
  name: string;
  lastModifiedOn?: string;
};

export type YnabUser = {
  id: string;
  name: string;
};

export type YnabDefaultPlan = {
  id: string;
  name: string;
};

export type YnabPlanList = {
  plans: YnabPlanSummary[];
  defaultPlan: YnabDefaultPlan | null;
};

export type YnabPlanDetail = {
  id: string;
  name: string;
  lastModifiedOn?: string;
  firstMonth?: string;
  lastMonth?: string;
  accountCount?: number;
  categoryGroupCount?: number;
  payeeCount?: number;
};

export type YnabCategorySummary = {
  id: string;
  name: string;
  hidden: boolean;
  deleted: boolean;
  categoryGroupName?: string;
};

export type YnabCategoryGroupSummary = {
  id: string;
  name: string;
  hidden: boolean;
  deleted: boolean;
  categories: YnabCategorySummary[];
};

export type YnabCategoryDetail = {
  id: string;
  name: string;
  hidden: boolean;
  categoryGroupName?: string;
  balance?: number;
  goalType?: string;
  goalTarget?: number;
};

export type YnabMonthCategoryDetail = YnabCategoryDetail & {
  budgeted?: number;
  activity?: number;
  goalUnderFunded?: number;
};

export type YnabPlanSettings = {
  dateFormat?: {
    format: string;
  };
  currencyFormat?: {
    isoCode?: string;
    exampleFormat?: string;
    decimalDigits?: number;
    decimalSeparator?: string;
    symbolFirst?: boolean;
    groupSeparator?: string;
    currencySymbol?: string;
    displaySymbol?: boolean;
  };
};

export type YnabPlanMonthSummary = {
  month: string;
  income?: number;
  budgeted?: number;
  activity?: number;
  toBeBudgeted?: number;
  deleted?: boolean;
};

export type YnabPlanMonthDetail = YnabPlanMonthSummary & {
  ageOfMoney?: number;
  categoryCount?: number;
  categories?: Array<{
    id: string;
    name: string;
    budgeted?: number;
    activity?: number;
    balance: number;
    deleted?: boolean;
    hidden?: boolean;
    goalUnderFunded?: number | null;
    categoryGroupName?: string;
  }>;
};

export type YnabAccountSummary = {
  id: string;
  name: string;
  type: string;
  closed: boolean;
  deleted?: boolean;
  balance: number;
};

export type YnabAccountDetail = {
  id: string;
  name: string;
  type: string;
  onBudget?: boolean;
  closed: boolean;
  balance?: number;
};

export type YnabTransaction = {
  id: string;
  date: string;
  amount: number;
  payeeId?: string | null;
  payeeName?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  approved?: boolean | null;
  cleared?: string | null;
  deleted?: boolean;
  isTransfer?: boolean;
  transferAccountId?: string | null;
};

export type YnabScheduledTransaction = {
  id: string;
  dateFirst: string;
  dateNext?: string | null;
  amount: number;
  payeeName?: string | null;
  categoryName?: string | null;
  accountName?: string | null;
  deleted?: boolean;
};

export type YnabPayee = {
  id: string;
  name: string;
  transferAccountId?: string | null;
  deleted?: boolean;
};

export type YnabPayeeLocation = {
  id: string;
  payeeId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  deleted?: boolean;
};

export interface YnabClient {
  getUser(): Promise<YnabUser>;
  listPlans(): Promise<YnabPlanList>;
  getPlan(planId: string): Promise<YnabPlanDetail>;
  listCategories(planId: string): Promise<YnabCategoryGroupSummary[]>;
  getCategory(planId: string, categoryId: string): Promise<YnabCategoryDetail>;
  getMonthCategory(planId: string, month: string, categoryId: string): Promise<YnabMonthCategoryDetail>;
  getPlanSettings(planId: string): Promise<YnabPlanSettings>;
  listPlanMonths(planId: string): Promise<YnabPlanMonthSummary[]>;
  getPlanMonth(planId: string, month: string): Promise<YnabPlanMonthDetail>;
  listAccounts(planId: string): Promise<YnabAccountSummary[]>;
  getAccount(planId: string, accountId: string): Promise<YnabAccountDetail>;
  listTransactions(planId: string, fromDate?: string): Promise<YnabTransaction[]>;
  listTransactionsByAccount(planId: string, accountId: string): Promise<YnabTransaction[]>;
  listTransactionsByCategory(planId: string, categoryId: string): Promise<YnabTransaction[]>;
  listTransactionsByPayee(planId: string, payeeId: string): Promise<YnabTransaction[]>;
  getTransaction(planId: string, transactionId: string): Promise<YnabTransaction>;
  listScheduledTransactions(planId: string): Promise<YnabScheduledTransaction[]>;
  getScheduledTransaction(planId: string, scheduledTransactionId: string): Promise<YnabScheduledTransaction>;
  listPayees(planId: string): Promise<YnabPayee[]>;
  getPayee(planId: string, payeeId: string): Promise<YnabPayee>;
  listPayeeLocations(planId: string): Promise<YnabPayeeLocation[]>;
  getPayeeLocation(planId: string, payeeLocationId: string): Promise<YnabPayeeLocation>;
  getPayeeLocationsByPayee(planId: string, payeeId: string): Promise<YnabPayeeLocation[]>;
}

type CreateYnabClientOptions = {
  accessToken: string;
  baseUrl: string;
  fetchFn?: typeof fetch;
};

type YnabPlansResponse = {
  data: {
    plans: Array<{
      id: string;
      name: string;
      last_modified_on?: string;
    }>;
    default_plan?: {
      id: string;
      name: string;
    };
  };
};

type YnabUserResponse = {
  data: {
    user: {
      id: string;
      name: string;
    };
  };
};

type YnabPlanResponse = {
  data: {
    plan: {
      id: string;
      name: string;
      last_modified_on?: string;
      first_month?: string;
      last_month?: string;
      accounts?: unknown[];
      category_groups?: unknown[];
      payees?: unknown[];
    };
  };
};

type YnabAccountsResponse = {
  data: {
    accounts: Array<{
      id: string;
      name: string;
      type: string;
      closed: boolean;
      deleted?: boolean;
      balance: number;
    }>;
  };
};

type YnabCategoriesResponse = {
  data: {
    category_groups: Array<{
      id: string;
      name: string;
      hidden: boolean;
      deleted: boolean;
      categories: Array<{
        id: string;
        name: string;
        hidden: boolean;
        deleted: boolean;
        category_group_name?: string;
      }>;
    }>;
  };
};

type YnabAccountResponse = {
  data: {
    account: {
      id: string;
      name: string;
      type: string;
      on_budget?: boolean;
      closed: boolean;
      balance?: number;
    };
  };
};

type YnabCategoryResponse = {
  data: {
    category: {
      id: string;
      name: string;
      hidden: boolean;
      category_group_name?: string;
      balance?: number;
      goal_type?: string;
      goal_target?: number;
      budgeted?: number;
      activity?: number;
      goal_under_funded?: number;
    };
  };
};

type YnabPlanSettingsResponse = {
  data: {
    settings: {
      date_format?: {
        format: string;
      };
      currency_format?: {
        iso_code?: string;
        example_format?: string;
        decimal_digits?: number;
        decimal_separator?: string;
        symbol_first?: boolean;
        group_separator?: string;
        currency_symbol?: string;
        display_symbol?: boolean;
      };
    };
  };
};

type YnabPlanMonthsResponse = {
  data: {
    months: Array<{
      month: string;
      income?: number;
      budgeted?: number;
      activity?: number;
      to_be_budgeted?: number;
      deleted?: boolean;
    }>;
  };
};

type YnabPlanMonthResponse = {
  data: {
    month: {
      month: string;
      income?: number;
      budgeted?: number;
      activity?: number;
      to_be_budgeted?: number;
      age_of_money?: number;
      categories?: Array<{
        id: string;
        name: string;
        budgeted?: number;
        activity?: number;
        balance: number;
        deleted?: boolean;
        hidden?: boolean;
        goal_under_funded?: number | null;
        category_group_name?: string;
      }>;
    };
  };
};

type YnabTransactionRecord = {
  id: string;
  date: string;
  amount: number;
  payee_id?: string | null;
  payee_name?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  account_id?: string | null;
  account_name?: string | null;
  approved?: boolean | null;
  cleared?: string | null;
  deleted?: boolean;
  transfer_account_id?: string | null;
};

type YnabTransactionsResponse = {
  data: {
    transactions: YnabTransactionRecord[];
  };
};

type YnabTransactionResponse = {
  data: {
    transaction: YnabTransactionRecord;
  };
};

type YnabScheduledTransactionRecord = {
  id: string;
  date_first: string;
  date_next?: string | null;
  amount: number;
  payee_name?: string | null;
  category_name?: string | null;
  account_name?: string | null;
  deleted?: boolean;
};

type YnabScheduledTransactionsResponse = {
  data: {
    scheduled_transactions: YnabScheduledTransactionRecord[];
  };
};

type YnabScheduledTransactionResponse = {
  data: {
    scheduled_transaction: YnabScheduledTransactionRecord;
  };
};

type YnabPayeeRecord = {
  id: string;
  name: string;
  transfer_account_id?: string | null;
  deleted?: boolean;
};

type YnabPayeesResponse = {
  data: {
    payees: YnabPayeeRecord[];
  };
};

type YnabPayeeResponse = {
  data: {
    payee: YnabPayeeRecord;
  };
};

type YnabPayeeLocationRecord = {
  id: string;
  payee_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  deleted?: boolean;
};

type YnabPayeeLocationsResponse = {
  data: {
    payee_locations: YnabPayeeLocationRecord[];
  };
};

type YnabPayeeLocationResponse = {
  data: {
    payee_location: YnabPayeeLocationRecord;
  };
};

async function getJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = response.statusText;

    try {
      const payload = await response.json() as {
        error?: {
          detail?: string;
        };
      };

      if (typeof payload.error?.detail === "string" && payload.error.detail.length > 0) {
        detail = payload.error.detail;
      }
    } catch {
      // Preserve the status-based fallback when YNAB does not return JSON.
    }

    const message = typeof detail === "string" && detail.length > 0
      ? `YNAB API request failed with ${response.status}: ${detail}`
      : `YNAB API request failed with ${response.status}`;

    if (response.status === 429) {
      throw new YnabClientError(message, "rate_limit", true);
    }

    if (response.status >= 500) {
      throw new YnabClientError(message, "upstream", true);
    }

    if (response.status === 401) {
      throw new YnabClientError(message, "internal", false);
    }

    throw new YnabClientError(message, "internal", false);
  }

  try {
    return await response.json() as T;
  } catch (error) {
    throw new YnabClientError(
      error instanceof Error ? error.message : "YNAB API returned malformed JSON.",
      "upstream",
      true
    );
  }
}

function toYnabTransaction(transaction: YnabTransactionRecord): YnabTransaction {
  return mapTransactionRecord(transaction);
}

function toYnabScheduledTransaction(transaction: YnabScheduledTransactionRecord): YnabScheduledTransaction {
  return {
    id: transaction.id,
    dateFirst: transaction.date_first,
    dateNext: transaction.date_next,
    amount: transaction.amount,
    payeeName: transaction.payee_name,
    categoryName: transaction.category_name,
    accountName: transaction.account_name,
    deleted: transaction.deleted
  };
}

function toYnabPayee(payee: YnabPayeeRecord): YnabPayee {
  return {
    id: payee.id,
    name: payee.name,
    transferAccountId: payee.transfer_account_id,
    deleted: payee.deleted
  };
}

function toYnabPayeeLocation(location: YnabPayeeLocationRecord): YnabPayeeLocation {
  return {
    id: location.id,
    payeeId: location.payee_id,
    latitude: location.latitude,
    longitude: location.longitude,
    deleted: location.deleted
  };
}

export function createYnabClient(options: CreateYnabClientOptions): YnabClient {
  const fetchFn = options.fetchFn ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const authorizationHeaders = {
    Authorization: `Bearer ${options.accessToken}`
  };

  async function authorizedFetch(input: string) {
    try {
      return await fetchFn(input, {
        headers: authorizationHeaders
      });
    } catch (error) {
      throw new YnabClientError(
        error instanceof Error ? error.message : "YNAB API request failed before a response was received.",
        "upstream",
        true
      );
    }
  }

  return {
    async getUser() {
      const response = await authorizedFetch(`${baseUrl}/user`);
      const payload = await getJson<YnabUserResponse>(response);

      return {
        id: payload.data.user.id,
        name: payload.data.user.name
      };
    },
    async listPlans() {
      const response = await authorizedFetch(`${baseUrl}/plans`);
      const payload = await getJson<YnabPlansResponse>(response);

      return {
        plans: payload.data.plans.map((plan) => ({
          id: plan.id,
          name: plan.name,
          lastModifiedOn: plan.last_modified_on
        })),
        defaultPlan: payload.data.default_plan
          ? {
              id: payload.data.default_plan.id,
              name: payload.data.default_plan.name
            }
          : null
      };
    },
    async getPlan(planId: string) {
      const response = await authorizedFetch(`${baseUrl}/plans/${encodeURIComponent(planId)}`);
      const payload = await getJson<YnabPlanResponse>(response);
      const plan = payload.data.plan;

      return {
        id: plan.id,
        name: plan.name,
        lastModifiedOn: plan.last_modified_on,
        firstMonth: plan.first_month,
        lastMonth: plan.last_month,
        accountCount: Array.isArray(plan.accounts) ? plan.accounts.length : undefined,
        categoryGroupCount: Array.isArray(plan.category_groups) ? plan.category_groups.length : undefined,
        payeeCount: Array.isArray(plan.payees) ? plan.payees.length : undefined
      };
    },
    async listCategories(planId: string) {
      const response = await authorizedFetch(`${baseUrl}/plans/${encodeURIComponent(planId)}/categories`);
      const payload = await getJson<YnabCategoriesResponse>(response);

      return payload.data.category_groups.map((group) => ({
        id: group.id,
        name: group.name,
        hidden: group.hidden,
        deleted: group.deleted,
        categories: group.categories.map((category) => ({
          id: category.id,
          name: category.name,
          hidden: category.hidden,
          deleted: category.deleted,
          categoryGroupName: category.category_group_name
        }))
      }));
    },
    async getCategory(planId: string, categoryId: string) {
      const response = await authorizedFetch(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/categories/${encodeURIComponent(categoryId)}`
      );
      const payload = await getJson<YnabCategoryResponse>(response);
      const category = payload.data.category;

      return {
        id: category.id,
        name: category.name,
        hidden: category.hidden,
        categoryGroupName: category.category_group_name,
        balance: category.balance,
        goalType: category.goal_type,
        goalTarget: category.goal_target
      };
    },
    async getMonthCategory(planId: string, month: string, categoryId: string) {
      const response = await authorizedFetch(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/months/${encodeURIComponent(month)}/categories/${encodeURIComponent(categoryId)}`
      );
      const payload = await getJson<YnabCategoryResponse>(response);
      const category = payload.data.category;

      return {
        id: category.id,
        name: category.name,
        hidden: category.hidden,
        categoryGroupName: category.category_group_name,
        budgeted: category.budgeted,
        activity: category.activity,
        balance: category.balance,
        goalType: category.goal_type,
        goalTarget: category.goal_target,
        goalUnderFunded: category.goal_under_funded
      };
    },
    async getPlanSettings(planId: string) {
      const response = await authorizedFetch(`${baseUrl}/plans/${encodeURIComponent(planId)}/settings`);
      const payload = await getJson<YnabPlanSettingsResponse>(response);
      const settings = payload.data.settings;

      return {
        dateFormat: settings.date_format
          ? {
              format: settings.date_format.format
            }
          : undefined,
        currencyFormat: settings.currency_format
          ? {
              isoCode: settings.currency_format.iso_code,
              exampleFormat: settings.currency_format.example_format,
              decimalDigits: settings.currency_format.decimal_digits,
              decimalSeparator: settings.currency_format.decimal_separator,
              symbolFirst: settings.currency_format.symbol_first,
              groupSeparator: settings.currency_format.group_separator,
              currencySymbol: settings.currency_format.currency_symbol,
              displaySymbol: settings.currency_format.display_symbol
            }
          : undefined
      };
    },
    async listPlanMonths(planId: string) {
      const response = await authorizedFetch(`${baseUrl}/plans/${encodeURIComponent(planId)}/months`);
      const payload = await getJson<YnabPlanMonthsResponse>(response);

      return payload.data.months.map((month) => ({
        month: month.month,
        income: month.income,
        budgeted: month.budgeted,
        activity: month.activity,
        toBeBudgeted: month.to_be_budgeted,
        deleted: month.deleted
      }));
    },
    async getPlanMonth(planId: string, month: string) {
      const response = await authorizedFetch(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/months/${encodeURIComponent(month)}`
      );
      const payload = await getJson<YnabPlanMonthResponse>(response);
      const monthDetail = payload.data.month;

      return {
        month: monthDetail.month,
        income: monthDetail.income,
        budgeted: monthDetail.budgeted,
        activity: monthDetail.activity,
        toBeBudgeted: monthDetail.to_be_budgeted,
        ageOfMoney: monthDetail.age_of_money,
        categoryCount: Array.isArray(monthDetail.categories) ? monthDetail.categories.length : undefined,
        categories: monthDetail.categories?.map((category) => ({
          id: category.id,
          name: category.name,
          budgeted: category.budgeted,
          activity: category.activity,
          balance: category.balance,
          deleted: category.deleted,
          hidden: category.hidden,
          goalUnderFunded: category.goal_under_funded,
          categoryGroupName: category.category_group_name
        }))
      };
    },
    async listAccounts(planId: string) {
      const response = await authorizedFetch(`${baseUrl}/plans/${encodeURIComponent(planId)}/accounts`);
      const payload = await getJson<YnabAccountsResponse>(response);

      return payload.data.accounts.map((account) => ({
        id: account.id,
        name: account.name,
        type: account.type,
        closed: account.closed,
        deleted: account.deleted,
        balance: account.balance
      }));
    },
    async getAccount(planId: string, accountId: string) {
      const response = await authorizedFetch(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/accounts/${encodeURIComponent(accountId)}`
      );
      const payload = await getJson<YnabAccountResponse>(response);
      const account = payload.data.account;

      return {
        id: account.id,
        name: account.name,
        type: account.type,
        onBudget: account.on_budget,
        closed: account.closed,
        balance: account.balance
      };
    },
    async listTransactions(planId: string, fromDate?: string) {
      const url = new URL(`${baseUrl}/plans/${encodeURIComponent(planId)}/transactions`);

      if (fromDate) {
        url.searchParams.set("since_date", fromDate);
      }

      const response = await authorizedFetch(url.toString());
      const payload = await getJson<YnabTransactionsResponse>(response);

      return payload.data.transactions.map(toYnabTransaction);
    },
    async listTransactionsByAccount(planId: string, accountId: string) {
      const response = await authorizedFetch(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/accounts/${encodeURIComponent(accountId)}/transactions`
      );
      const payload = await getJson<YnabTransactionsResponse>(response);

      return payload.data.transactions.map(toYnabTransaction);
    },
    async listTransactionsByCategory(planId: string, categoryId: string) {
      const response = await authorizedFetch(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/categories/${encodeURIComponent(categoryId)}/transactions`
      );
      const payload = await getJson<YnabTransactionsResponse>(response);

      return payload.data.transactions.map(toYnabTransaction);
    },
    async listTransactionsByPayee(planId: string, payeeId: string) {
      const response = await authorizedFetch(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/payees/${encodeURIComponent(payeeId)}/transactions`
      );
      const payload = await getJson<YnabTransactionsResponse>(response);

      return payload.data.transactions.map(toYnabTransaction);
    },
    async getTransaction(planId: string, transactionId: string) {
      const response = await authorizedFetch(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/transactions/${encodeURIComponent(transactionId)}`
      );
      const payload = await getJson<YnabTransactionResponse>(response);

      return toYnabTransaction(payload.data.transaction);
    },
    async listScheduledTransactions(planId: string) {
      const response = await authorizedFetch(`${baseUrl}/plans/${encodeURIComponent(planId)}/scheduled_transactions`);
      const payload = await getJson<YnabScheduledTransactionsResponse>(response);

      return payload.data.scheduled_transactions.map(toYnabScheduledTransaction);
    },
    async getScheduledTransaction(planId: string, scheduledTransactionId: string) {
      const response = await authorizedFetch(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/scheduled_transactions/${encodeURIComponent(scheduledTransactionId)}`
      );
      const payload = await getJson<YnabScheduledTransactionResponse>(response);

      return toYnabScheduledTransaction(payload.data.scheduled_transaction);
    },
    async listPayees(planId: string) {
      const response = await authorizedFetch(`${baseUrl}/plans/${encodeURIComponent(planId)}/payees`);
      const payload = await getJson<YnabPayeesResponse>(response);

      return payload.data.payees.map(toYnabPayee);
    },
    async getPayee(planId: string, payeeId: string) {
      const response = await authorizedFetch(`${baseUrl}/plans/${encodeURIComponent(planId)}/payees/${encodeURIComponent(payeeId)}`);
      const payload = await getJson<YnabPayeeResponse>(response);

      return toYnabPayee(payload.data.payee);
    },
    async listPayeeLocations(planId: string) {
      const response = await authorizedFetch(`${baseUrl}/plans/${encodeURIComponent(planId)}/payee_locations`);
      const payload = await getJson<YnabPayeeLocationsResponse>(response);

      return payload.data.payee_locations.map(toYnabPayeeLocation);
    },
    async getPayeeLocation(planId: string, payeeLocationId: string) {
      const response = await authorizedFetch(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/payee_locations/${encodeURIComponent(payeeLocationId)}`
      );
      const payload = await getJson<YnabPayeeLocationResponse>(response);

      return toYnabPayeeLocation(payload.data.payee_location);
    },
    async getPayeeLocationsByPayee(planId: string, payeeId: string) {
      const response = await authorizedFetch(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/payees/${encodeURIComponent(payeeId)}/payee_locations`
      );
      const payload = await getJson<YnabPayeeLocationsResponse>(response);

      return payload.data.payee_locations.map(toYnabPayeeLocation);
    }
  };
}
