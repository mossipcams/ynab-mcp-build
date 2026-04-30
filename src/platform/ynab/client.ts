import { z } from "zod";

import { mapTransactionRecord } from "./mappers.js";

export type YnabClientErrorCategory = "internal" | "rate_limit" | "upstream";

export class YnabClientError extends Error {
  category: YnabClientErrorCategory;
  retryable: boolean;

  constructor(
    message: string,
    category: YnabClientErrorCategory,
    retryable: boolean,
  ) {
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
  deleted?: boolean;
  categoryGroupId?: string | null;
  categoryGroupName?: string;
  originalCategoryGroupId?: string | null;
  note?: string | null;
  budgeted?: number;
  activity?: number;
  balance?: number;
  goalType?: string | null;
  goalTarget?: number | null;
  goalTargetDate?: string | null;
  goalTargetMonth?: string | null;
  goalNeedsWholeAmount?: boolean | null;
  goalDay?: number | null;
  goalCadence?: number | null;
  goalCadenceFrequency?: number | null;
  goalCreationMonth?: string | null;
  goalPercentageComplete?: number | null;
  goalMonthsToBudget?: number | null;
  goalUnderFunded?: number | null;
  goalOverallFunded?: number | null;
  goalOverallLeft?: number | null;
  goalSnoozedAt?: string | null;
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
    categoryGroupId?: string | null;
    budgeted?: number;
    activity?: number;
    balance: number;
    deleted?: boolean;
    hidden?: boolean;
    goalUnderFunded?: number | null;
    categoryGroupName?: string;
    originalCategoryGroupId?: string | null;
    note?: string | null;
    goalType?: string | null;
    goalTarget?: number | null;
    goalTargetDate?: string | null;
    goalTargetMonth?: string | null;
    goalNeedsWholeAmount?: boolean | null;
    goalDay?: number | null;
    goalCadence?: number | null;
    goalCadenceFrequency?: number | null;
    goalCreationMonth?: string | null;
    goalPercentageComplete?: number | null;
    goalMonthsToBudget?: number | null;
    goalOverallFunded?: number | null;
    goalOverallLeft?: number | null;
    goalSnoozedAt?: string | null;
  }>;
};

export type YnabAccountSummary = {
  id: string;
  name: string;
  type: string;
  onBudget?: boolean;
  closed: boolean;
  note?: string | null;
  deleted?: boolean;
  balance: number;
  clearedBalance?: number;
  unclearedBalance?: number;
  transferPayeeId?: string | null;
  directImportLinked?: boolean | null;
  directImportInError?: boolean | null;
  lastReconciledAt?: string | null;
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
  memo?: string | null;
  payeeId?: string | null;
  payeeName?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  approved?: boolean | null;
  cleared?: string | null;
  flagColor?: string | null;
  flagName?: string | null;
  deleted?: boolean;
  isTransfer?: boolean;
  transferAccountId?: string | null;
  transferTransactionId?: string | null;
  matchedTransactionId?: string | null;
  importId?: string | null;
  importPayeeName?: string | null;
  importPayeeNameOriginal?: string | null;
  debtTransactionType?: string | null;
  subtransactions?: YnabSubtransaction[];
};

export type YnabSubtransaction = {
  id: string;
  transactionId?: string | null;
  amount: number;
  memo?: string | null;
  payeeId?: string | null;
  payeeName?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  transferAccountId?: string | null;
  transferTransactionId?: string | null;
  deleted?: boolean;
};

export type YnabScheduledTransaction = {
  id: string;
  dateFirst: string;
  dateNext?: string | null;
  frequency?: string | null;
  amount: number;
  memo?: string | null;
  flagColor?: string | null;
  flagName?: string | null;
  accountId?: string | null;
  payeeName?: string | null;
  payeeId?: string | null;
  categoryName?: string | null;
  categoryId?: string | null;
  accountName?: string | null;
  transferAccountId?: string | null;
  deleted?: boolean;
  subtransactions?: YnabScheduledSubtransaction[];
};

export type YnabScheduledSubtransaction = {
  id: string;
  scheduledTransactionId?: string | null;
  amount: number;
  memo?: string | null;
  payeeId?: string | null;
  payeeName?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  transferAccountId?: string | null;
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
  latitude?: number | string | null;
  longitude?: number | string | null;
  deleted?: boolean;
};

export type YnabMoneyMovement = {
  id: string;
  month?: string | null;
  movedAt?: string | null;
  note?: string | null;
  moneyMovementGroupId?: string | null;
  performedByUserId?: string | null;
  fromCategoryId?: string | null;
  toCategoryId?: string | null;
  amount: number;
  deleted?: boolean;
};

export type YnabMoneyMovementGroup = {
  id: string;
  groupCreatedAt: string;
  month: string;
  note?: string | null;
  performedByUserId?: string | null;
  deleted?: boolean;
};

export type YnabMoneyMovementsResult = {
  moneyMovements: YnabMoneyMovement[];
  serverKnowledge: number;
};

export type YnabMoneyMovementGroupsResult = {
  moneyMovementGroups: YnabMoneyMovementGroup[];
  serverKnowledge: number;
};

export interface YnabClient {
  getUser(): Promise<YnabUser>;
  listPlans(): Promise<YnabPlanList>;
  getPlan(planId: string): Promise<YnabPlanDetail>;
  listCategories(planId: string): Promise<YnabCategoryGroupSummary[]>;
  getCategory(planId: string, categoryId: string): Promise<YnabCategoryDetail>;
  getMonthCategory(
    planId: string,
    month: string,
    categoryId: string,
  ): Promise<YnabMonthCategoryDetail>;
  getPlanSettings(planId: string): Promise<YnabPlanSettings>;
  listPlanMonths(planId: string): Promise<YnabPlanMonthSummary[]>;
  getPlanMonth(planId: string, month: string): Promise<YnabPlanMonthDetail>;
  listAccounts(planId: string): Promise<YnabAccountSummary[]>;
  getAccount(planId: string, accountId: string): Promise<YnabAccountDetail>;
  listTransactions(
    planId: string,
    fromDate?: string,
    toDate?: string,
  ): Promise<YnabTransaction[]>;
  listTransactionsByAccount(
    planId: string,
    accountId: string,
  ): Promise<YnabTransaction[]>;
  listTransactionsByCategory(
    planId: string,
    categoryId: string,
  ): Promise<YnabTransaction[]>;
  listTransactionsByPayee(
    planId: string,
    payeeId: string,
  ): Promise<YnabTransaction[]>;
  getTransaction(
    planId: string,
    transactionId: string,
  ): Promise<YnabTransaction>;
  listScheduledTransactions(
    planId: string,
  ): Promise<YnabScheduledTransaction[]>;
  getScheduledTransaction(
    planId: string,
    scheduledTransactionId: string,
  ): Promise<YnabScheduledTransaction>;
  listPayees(planId: string): Promise<YnabPayee[]>;
  getPayee(planId: string, payeeId: string): Promise<YnabPayee>;
  listPayeeLocations(planId: string): Promise<YnabPayeeLocation[]>;
  getPayeeLocation(
    planId: string,
    payeeLocationId: string,
  ): Promise<YnabPayeeLocation>;
  getPayeeLocationsByPayee(
    planId: string,
    payeeId: string,
  ): Promise<YnabPayeeLocation[]>;
  listMoneyMovements(
    planId: string,
    serverKnowledge?: number,
  ): Promise<YnabMoneyMovementsResult>;
  listMoneyMovementGroups(
    planId: string,
    serverKnowledge?: number,
  ): Promise<YnabMoneyMovementGroupsResult>;
}

type CreateYnabClientOptions = {
  accessToken: string;
  baseUrl: string;
  fetchFn?: typeof fetch;
};

const YNAB_REQUEST_ATTEMPTS = 2;

type Compact<T extends Record<string, unknown>> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K];
} & {
  [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<
    T[K],
    undefined
  >;
};

function compact<T extends Record<string, unknown>>(entry: T): Compact<T> {
  return Object.fromEntries(
    Object.entries(entry).filter(([, value]) => value !== undefined),
  ) as Compact<T>;
}

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
      name?: string;
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

export type YnabAccountRecord = {
  id: string;
  name: string;
  type: string;
  on_budget?: boolean | null;
  closed: boolean;
  note?: string | null;
  balance: number;
  cleared_balance?: number;
  uncleared_balance?: number;
  transfer_payee_id?: string | null;
  direct_import_linked?: boolean | null;
  direct_import_in_error?: boolean | null;
  last_reconciled_at?: string | null;
  deleted?: boolean;
};

export type YnabCategoryRecord = {
  id: string;
  category_group_id?: string | null;
  category_group_name?: string;
  original_category_group_id?: string | null;
  name: string;
  note?: string | null;
  hidden: boolean;
  budgeted?: number;
  activity?: number;
  balance?: number;
  goal_type?: string | null;
  goal_target?: number | null;
  goal_target_date?: string | null;
  goal_target_month?: string | null;
  goal_needs_whole_amount?: boolean | null;
  goal_day?: number | null;
  goal_cadence?: number | null;
  goal_cadence_frequency?: number | null;
  goal_creation_month?: string | null;
  goal_percentage_complete?: number | null;
  goal_months_to_budget?: number | null;
  goal_under_funded?: number | null;
  goal_overall_funded?: number | null;
  goal_overall_left?: number | null;
  goal_snoozed_at?: string | null;
  deleted: boolean;
};

export type YnabCategoryGroupRecord = {
  id: string;
  name: string;
  hidden: boolean;
  deleted: boolean;
  categories?: YnabCategoryRecord[];
};

export type YnabPlanMonthRecord = {
  month: string;
  note?: string | null;
  income?: number;
  budgeted?: number;
  activity?: number;
  to_be_budgeted?: number;
  age_of_money?: number | null;
  categories?: YnabCategoryRecord[];
  deleted?: boolean;
};

type YnabAccountsResponse = {
  data: {
    accounts: YnabAccountRecord[];
  };
};

type YnabCategoriesResponse = {
  data: {
    category_groups: Array<
      YnabCategoryGroupRecord & {
        categories: YnabCategoryRecord[];
      }
    >;
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
  memo?: string | null;
  payee_id?: string | null;
  payee_name?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  account_id?: string | null;
  account_name?: string | null;
  approved?: boolean | null;
  cleared?: string | null;
  flag_color?: string | null;
  flag_name?: string | null;
  deleted?: boolean;
  transfer_account_id?: string | null;
  transfer_transaction_id?: string | null;
  matched_transaction_id?: string | null;
  import_id?: string | null;
  import_payee_name?: string | null;
  import_payee_name_original?: string | null;
  debt_transaction_type?: string | null;
  subtransactions?: YnabSubtransactionRecord[];
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

export type YnabScheduledTransactionRecord = {
  id: string;
  date_first: string;
  date_next?: string | null;
  frequency?: string | null;
  amount: number;
  memo?: string | null;
  flag_color?: string | null;
  flag_name?: string | null;
  account_id?: string | null;
  payee_name?: string | null;
  payee_id?: string | null;
  category_name?: string | null;
  category_id?: string | null;
  account_name?: string | null;
  transfer_account_id?: string | null;
  deleted?: boolean;
  subtransactions?: YnabScheduledSubtransactionRecord[];
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

export type YnabPayeeRecord = {
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

export type YnabPayeeLocationRecord = {
  id: string;
  payee_id?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  deleted?: boolean;
};

type YnabSubtransactionRecord = {
  id: string;
  transaction_id?: string | null;
  amount: number;
  memo?: string | null;
  payee_id?: string | null;
  payee_name?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  transfer_account_id?: string | null;
  transfer_transaction_id?: string | null;
  deleted?: boolean;
};

type YnabScheduledSubtransactionRecord = {
  id: string;
  scheduled_transaction_id?: string | null;
  amount: number;
  memo?: string | null;
  payee_id?: string | null;
  payee_name?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  transfer_account_id?: string | null;
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

type YnabMoneyMovementRecord = {
  id: string;
  month?: string | null;
  moved_at?: string | null;
  note?: string | null;
  money_movement_group_id?: string | null;
  performed_by_user_id?: string | null;
  from_category_id?: string | null;
  to_category_id?: string | null;
  amount: number;
  deleted?: boolean;
};

type YnabMoneyMovementsResponse = {
  data: {
    money_movements: YnabMoneyMovementRecord[];
    server_knowledge: number;
  };
};

type YnabMoneyMovementGroupRecord = {
  id: string;
  group_created_at: string;
  month: string;
  note?: string | null;
  performed_by_user_id?: string | null;
  deleted?: boolean;
};

type YnabMoneyMovementGroupsResponse = {
  data: {
    money_movement_groups: YnabMoneyMovementGroupRecord[];
    server_knowledge: number;
  };
};

const YnabErrorResponseSchema = z
  .object({
    error: z
      .object({
        detail: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

const optionalNullableString = z.string().nullable().optional();
const optionalNullableNumber = z.number().nullable().optional();
const optionalNullableBoolean = z.boolean().nullable().optional();

const YnabAccountRecordSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    closed: z.boolean(),
    balance: z.number(),
    on_budget: optionalNullableBoolean,
    note: optionalNullableString,
    cleared_balance: z.number().optional(),
    uncleared_balance: z.number().optional(),
    transfer_payee_id: optionalNullableString,
    direct_import_linked: optionalNullableBoolean,
    direct_import_in_error: optionalNullableBoolean,
    last_reconciled_at: optionalNullableString,
    deleted: z.boolean().optional(),
  })
  .passthrough();

const YnabCategoryRecordSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    hidden: z.boolean(),
    deleted: z.boolean().optional(),
    category_group_id: optionalNullableString,
    category_group_name: z.string().optional(),
    original_category_group_id: optionalNullableString,
    note: optionalNullableString,
    budgeted: z.number().optional(),
    activity: z.number().optional(),
    balance: z.number().optional(),
    goal_type: optionalNullableString,
    goal_target: optionalNullableNumber,
    goal_target_date: optionalNullableString,
    goal_target_month: optionalNullableString,
    goal_needs_whole_amount: optionalNullableBoolean,
    goal_day: optionalNullableNumber,
    goal_cadence: optionalNullableNumber,
    goal_cadence_frequency: optionalNullableNumber,
    goal_creation_month: optionalNullableString,
    goal_percentage_complete: optionalNullableNumber,
    goal_months_to_budget: optionalNullableNumber,
    goal_under_funded: optionalNullableNumber,
    goal_overall_funded: optionalNullableNumber,
    goal_overall_left: optionalNullableNumber,
    goal_snoozed_at: optionalNullableString,
  })
  .passthrough();

const YnabCategoryGroupRecordSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    hidden: z.boolean(),
    deleted: z.boolean(),
    categories: z.array(YnabCategoryRecordSchema).optional(),
  })
  .passthrough();

const YnabPlanMonthRecordSchema = z
  .object({
    month: z.string(),
    note: optionalNullableString,
    income: z.number().optional(),
    budgeted: z.number().optional(),
    activity: z.number().optional(),
    to_be_budgeted: z.number().optional(),
    age_of_money: optionalNullableNumber,
    categories: z.array(YnabCategoryRecordSchema).optional(),
    deleted: z.boolean().optional(),
  })
  .passthrough();

const YnabSubtransactionRecordSchema = z
  .object({
    id: z.string(),
    transaction_id: optionalNullableString,
    amount: z.number(),
    memo: optionalNullableString,
    payee_id: optionalNullableString,
    payee_name: optionalNullableString,
    category_id: optionalNullableString,
    category_name: optionalNullableString,
    transfer_account_id: optionalNullableString,
    transfer_transaction_id: optionalNullableString,
    deleted: z.boolean().optional(),
  })
  .passthrough();

const YnabTransactionRecordSchema = z
  .object({
    id: z.string(),
    date: z.string(),
    amount: z.number(),
    memo: optionalNullableString,
    payee_id: optionalNullableString,
    payee_name: optionalNullableString,
    category_id: optionalNullableString,
    category_name: optionalNullableString,
    account_id: optionalNullableString,
    account_name: optionalNullableString,
    approved: optionalNullableBoolean,
    cleared: optionalNullableString,
    flag_color: optionalNullableString,
    flag_name: optionalNullableString,
    deleted: z.boolean().optional(),
    transfer_account_id: optionalNullableString,
    transfer_transaction_id: optionalNullableString,
    matched_transaction_id: optionalNullableString,
    import_id: optionalNullableString,
    import_payee_name: optionalNullableString,
    import_payee_name_original: optionalNullableString,
    debt_transaction_type: optionalNullableString,
    subtransactions: z.array(YnabSubtransactionRecordSchema).optional(),
  })
  .passthrough();

const YnabScheduledSubtransactionRecordSchema = z
  .object({
    id: z.string(),
    scheduled_transaction_id: optionalNullableString,
    amount: z.number(),
    memo: optionalNullableString,
    payee_id: optionalNullableString,
    payee_name: optionalNullableString,
    category_id: optionalNullableString,
    category_name: optionalNullableString,
    transfer_account_id: optionalNullableString,
    deleted: z.boolean().optional(),
  })
  .passthrough();

const YnabScheduledTransactionRecordSchema = z
  .object({
    id: z.string(),
    date_first: z.string(),
    date_next: optionalNullableString,
    frequency: optionalNullableString,
    amount: z.number(),
    memo: optionalNullableString,
    flag_color: optionalNullableString,
    flag_name: optionalNullableString,
    account_id: optionalNullableString,
    payee_name: optionalNullableString,
    payee_id: optionalNullableString,
    category_name: optionalNullableString,
    category_id: optionalNullableString,
    account_name: optionalNullableString,
    transfer_account_id: optionalNullableString,
    deleted: z.boolean().optional(),
    subtransactions: z
      .array(YnabScheduledSubtransactionRecordSchema)
      .optional(),
  })
  .passthrough();

const YnabPayeeRecordSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    transfer_account_id: optionalNullableString,
    deleted: z.boolean().optional(),
  })
  .passthrough();

const YnabPayeeLocationRecordSchema = z
  .object({
    id: z.string(),
    payee_id: optionalNullableString,
    latitude: z.union([z.number(), z.string()]).nullable().optional(),
    longitude: z.union([z.number(), z.string()]).nullable().optional(),
    deleted: z.boolean().optional(),
  })
  .passthrough();

const YnabMoneyMovementRecordSchema = z
  .object({
    id: z.string(),
    month: optionalNullableString,
    moved_at: optionalNullableString,
    note: optionalNullableString,
    money_movement_group_id: optionalNullableString,
    performed_by_user_id: optionalNullableString,
    from_category_id: optionalNullableString,
    to_category_id: optionalNullableString,
    amount: z.number(),
    deleted: z.boolean().optional(),
  })
  .passthrough();

const YnabMoneyMovementGroupRecordSchema = z
  .object({
    id: z.string(),
    group_created_at: z.string(),
    month: z.string(),
    note: optionalNullableString,
    performed_by_user_id: optionalNullableString,
    deleted: z.boolean().optional(),
  })
  .passthrough();

const YnabUserResponseSchema = z
  .object({
    data: z
      .object({
        user: z
          .object({
            id: z.string(),
            name: z.string().optional(),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

const YnabPlansResponseSchema = z
  .object({
    data: z
      .object({
        plans: z.array(
          z
            .object({
              id: z.string(),
              name: z.string(),
              last_modified_on: z.string().optional(),
            })
            .passthrough(),
        ),
        default_plan: z
          .object({
            id: z.string(),
            name: z.string(),
          })
          .passthrough()
          .nullable()
          .optional(),
      })
      .passthrough(),
  })
  .passthrough();

const YnabPlanResponseSchema = z
  .object({
    data: z
      .object({
        plan: z
          .object({
            id: z.string(),
            name: z.string(),
            last_modified_on: z.string().optional(),
            first_month: z.string().optional(),
            last_month: z.string().optional(),
            accounts: z.array(z.unknown()).optional(),
            category_groups: z.array(z.unknown()).optional(),
            payees: z.array(z.unknown()).optional(),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

const YnabAccountsResponseSchema = z
  .object({
    data: z
      .object({ accounts: z.array(YnabAccountRecordSchema) })
      .passthrough(),
  })
  .passthrough();

const YnabCategoriesResponseSchema = z
  .object({
    data: z
      .object({
        category_groups: z.array(
          YnabCategoryGroupRecordSchema.extend({
            categories: z.array(YnabCategoryRecordSchema),
          }),
        ),
      })
      .passthrough(),
  })
  .passthrough();

const YnabAccountResponseSchema = z
  .object({
    data: z
      .object({
        account: YnabAccountRecordSchema.extend({
          balance: z.number().optional(),
        }),
      })
      .passthrough(),
  })
  .passthrough();

const YnabCategoryResponseSchema = z
  .object({
    data: z
      .object({
        category: YnabCategoryRecordSchema.extend({
          deleted: z.boolean().optional(),
        }),
      })
      .passthrough(),
  })
  .passthrough();

const YnabPlanSettingsResponseSchema = z
  .object({
    data: z
      .object({
        settings: z
          .object({
            date_format: z
              .object({ format: z.string() })
              .passthrough()
              .optional(),
            currency_format: z
              .object({
                iso_code: z.string().optional(),
                example_format: z.string().optional(),
                decimal_digits: z.number().optional(),
                decimal_separator: z.string().optional(),
                symbol_first: z.boolean().optional(),
                group_separator: z.string().optional(),
                currency_symbol: z.string().optional(),
                display_symbol: z.boolean().optional(),
              })
              .passthrough()
              .optional(),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

const YnabPlanMonthsResponseSchema = z
  .object({
    data: z
      .object({ months: z.array(YnabPlanMonthRecordSchema) })
      .passthrough(),
  })
  .passthrough();

const YnabPlanMonthResponseSchema = z
  .object({
    data: z.object({ month: YnabPlanMonthRecordSchema }).passthrough(),
  })
  .passthrough();

const YnabTransactionsResponseSchema = z
  .object({
    data: z
      .object({ transactions: z.array(YnabTransactionRecordSchema) })
      .passthrough(),
  })
  .passthrough();

const YnabTransactionResponseSchema = z
  .object({
    data: z.object({ transaction: YnabTransactionRecordSchema }).passthrough(),
  })
  .passthrough();

const YnabScheduledTransactionsResponseSchema = z
  .object({
    data: z
      .object({
        scheduled_transactions: z.array(YnabScheduledTransactionRecordSchema),
      })
      .passthrough(),
  })
  .passthrough();

const YnabScheduledTransactionResponseSchema = z
  .object({
    data: z
      .object({ scheduled_transaction: YnabScheduledTransactionRecordSchema })
      .passthrough(),
  })
  .passthrough();

const YnabPayeesResponseSchema = z
  .object({
    data: z.object({ payees: z.array(YnabPayeeRecordSchema) }).passthrough(),
  })
  .passthrough();

const YnabPayeeResponseSchema = z
  .object({
    data: z.object({ payee: YnabPayeeRecordSchema }).passthrough(),
  })
  .passthrough();

const YnabPayeeLocationsResponseSchema = z
  .object({
    data: z
      .object({ payee_locations: z.array(YnabPayeeLocationRecordSchema) })
      .passthrough(),
  })
  .passthrough();

const YnabPayeeLocationResponseSchema = z
  .object({
    data: z
      .object({ payee_location: YnabPayeeLocationRecordSchema })
      .passthrough(),
  })
  .passthrough();

const YnabMoneyMovementsResponseSchema = z
  .object({
    data: z
      .object({
        money_movements: z.array(YnabMoneyMovementRecordSchema),
        server_knowledge: z.number(),
      })
      .passthrough(),
  })
  .passthrough();

const YnabMoneyMovementGroupsResponseSchema = z
  .object({
    data: z
      .object({
        money_movement_groups: z.array(YnabMoneyMovementGroupRecordSchema),
        server_knowledge: z.number(),
      })
      .passthrough(),
  })
  .passthrough();

async function getJson<T>(
  response: Response,
  schema: z.ZodType<unknown>,
): Promise<T> {
  if (!response.ok) {
    let detail = response.statusText;

    try {
      const rawPayload: unknown = await response.json();
      const payload = YnabErrorResponseSchema.parse(rawPayload);

      if (
        typeof payload.error?.detail === "string" &&
        payload.error.detail.length > 0
      ) {
        detail = payload.error.detail;
      }
    } catch {
      // Preserve the status-based fallback when YNAB does not return JSON.
    }

    const message =
      typeof detail === "string" && detail.length > 0
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
    const rawPayload: unknown = await response.json();
    const result = schema.safeParse(rawPayload);

    if (!result.success) {
      throw new YnabClientError(
        "YNAB API response did not match expected schema.",
        "upstream",
        true,
      );
    }

    return result.data as T;
  } catch (error) {
    if (error instanceof YnabClientError) {
      throw error;
    }

    throw new YnabClientError(
      error instanceof Error
        ? error.message
        : "YNAB API returned malformed JSON.",
      "upstream",
      true,
    );
  }
}

function toYnabTransaction(
  transaction: YnabTransactionRecord,
): YnabTransaction {
  return mapTransactionRecord(transaction) as YnabTransaction;
}

export function toYnabAccount(account: YnabAccountRecord): YnabAccountSummary {
  return compact({
    balance: account.balance,
    clearedBalance: account.cleared_balance,
    closed: account.closed,
    deleted: account.deleted,
    directImportInError: account.direct_import_in_error,
    directImportLinked: account.direct_import_linked,
    id: account.id,
    lastReconciledAt: account.last_reconciled_at,
    name: account.name,
    note: account.note,
    onBudget: account.on_budget ?? undefined,
    transferPayeeId: account.transfer_payee_id,
    type: account.type,
    unclearedBalance: account.uncleared_balance,
  });
}

export function toYnabCategory(
  category: YnabCategoryRecord,
): YnabCategorySummary {
  return compact({
    activity: category.activity,
    balance: category.balance,
    budgeted: category.budgeted,
    categoryGroupId: category.category_group_id,
    categoryGroupName: category.category_group_name,
    deleted: category.deleted,
    goalCadence: category.goal_cadence,
    goalCadenceFrequency: category.goal_cadence_frequency,
    goalCreationMonth: category.goal_creation_month,
    goalDay: category.goal_day,
    goalMonthsToBudget: category.goal_months_to_budget,
    goalNeedsWholeAmount: category.goal_needs_whole_amount,
    goalOverallFunded: category.goal_overall_funded,
    goalOverallLeft: category.goal_overall_left,
    goalPercentageComplete: category.goal_percentage_complete,
    goalSnoozedAt: category.goal_snoozed_at,
    goalTarget: category.goal_target,
    goalTargetDate: category.goal_target_date,
    goalTargetMonth: category.goal_target_month,
    goalType: category.goal_type,
    goalUnderFunded: category.goal_under_funded,
    hidden: category.hidden,
    id: category.id,
    name: category.name,
    note: category.note,
    originalCategoryGroupId: category.original_category_group_id,
  });
}

export function toYnabCategoryGroup(
  group: YnabCategoryGroupRecord,
  categoriesByGroupId: Map<string, YnabCategorySummary>[],
): YnabCategoryGroupSummary {
  const categories = categoriesByGroupId.flatMap((categoryMap) =>
    categoryMap.get(group.id) ? [categoryMap.get(group.id)!] : [],
  );

  return {
    categories: group.categories?.map(toYnabCategory) ?? categories,
    deleted: group.deleted,
    hidden: group.hidden,
    id: group.id,
    name: group.name,
  };
}

export function groupCategoriesByGroupId(categories: YnabCategorySummary[]) {
  const maps: Array<Map<string, YnabCategorySummary>> = [];

  for (const category of categories) {
    if (category.categoryGroupId) {
      const map = new Map<string, YnabCategorySummary>();
      map.set(category.categoryGroupId, category);
      maps.push(map);
    }
  }

  return maps;
}

export function toYnabMonth(month: YnabPlanMonthRecord): YnabPlanMonthDetail {
  return compact({
    activity: month.activity,
    ageOfMoney: month.age_of_money ?? undefined,
    budgeted: month.budgeted,
    categories: month.categories?.map((category) => ({
      ...toYnabCategory(category),
      balance: category.balance ?? 0,
    })),
    deleted: month.deleted,
    income: month.income,
    month: month.month,
    toBeBudgeted: month.to_be_budgeted,
  });
}

export function toYnabScheduledTransaction(
  transaction: YnabScheduledTransactionRecord,
): YnabScheduledTransaction {
  return compact({
    id: transaction.id,
    dateFirst: transaction.date_first,
    dateNext: transaction.date_next,
    frequency: transaction.frequency,
    amount: transaction.amount,
    memo: transaction.memo,
    flagColor: transaction.flag_color,
    flagName: transaction.flag_name,
    accountId: transaction.account_id,
    payeeId: transaction.payee_id,
    payeeName: transaction.payee_name,
    categoryId: transaction.category_id,
    categoryName: transaction.category_name,
    accountName: transaction.account_name,
    transferAccountId: transaction.transfer_account_id,
    deleted: transaction.deleted,
    subtransactions: transaction.subtransactions?.map((subtransaction) =>
      compact({
        amount: subtransaction.amount,
        categoryId: subtransaction.category_id,
        categoryName: subtransaction.category_name,
        deleted: subtransaction.deleted,
        id: subtransaction.id,
        memo: subtransaction.memo,
        payeeId: subtransaction.payee_id,
        payeeName: subtransaction.payee_name,
        scheduledTransactionId: subtransaction.scheduled_transaction_id,
        transferAccountId: subtransaction.transfer_account_id,
      }),
    ),
  });
}

export function toYnabPayee(payee: YnabPayeeRecord): YnabPayee {
  return compact({
    id: payee.id,
    name: payee.name,
    transferAccountId: payee.transfer_account_id,
    deleted: payee.deleted,
  });
}

export function toYnabPayeeLocation(
  location: YnabPayeeLocationRecord,
): YnabPayeeLocation {
  return compact({
    id: location.id,
    payeeId: location.payee_id,
    latitude: location.latitude,
    longitude: location.longitude,
    deleted: location.deleted,
  });
}

function toYnabMoneyMovement(
  movement: YnabMoneyMovementRecord,
): YnabMoneyMovement {
  return compact({
    amount: movement.amount,
    deleted: movement.deleted ?? false,
    fromCategoryId: movement.from_category_id,
    id: movement.id,
    moneyMovementGroupId: movement.money_movement_group_id,
    month: movement.month,
    movedAt: movement.moved_at,
    note: movement.note,
    performedByUserId: movement.performed_by_user_id,
    toCategoryId: movement.to_category_id,
  });
}

function toYnabMoneyMovementGroup(
  group: YnabMoneyMovementGroupRecord,
): YnabMoneyMovementGroup {
  return compact({
    deleted: group.deleted ?? false,
    groupCreatedAt: group.group_created_at,
    id: group.id,
    month: group.month,
    note: group.note,
    performedByUserId: group.performed_by_user_id,
  });
}

export function createYnabClient(options: CreateYnabClientOptions): YnabClient {
  const fetchFn = options.fetchFn ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const authorizationHeaders = {
    Authorization: `Bearer ${options.accessToken}`,
  };

  async function authorizedFetch(input: string) {
    for (let attempt = 1; attempt <= YNAB_REQUEST_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetchFn(input, {
          headers: authorizationHeaders,
        });

        if (
          attempt < YNAB_REQUEST_ATTEMPTS &&
          (response.status === 429 || response.status >= 500)
        ) {
          continue;
        }

        return response;
      } catch (error) {
        if (attempt < YNAB_REQUEST_ATTEMPTS) {
          continue;
        }

        throw new YnabClientError(
          error instanceof Error
            ? error.message
            : "YNAB API request failed before a response was received.",
          "upstream",
          true,
        );
      }
    }

    throw new YnabClientError(
      "YNAB API request failed before a response was received.",
      "upstream",
      true,
    );
  }

  function applyServerKnowledge(url: URL, serverKnowledge: number | undefined) {
    if (serverKnowledge !== undefined) {
      url.searchParams.set("last_knowledge_of_server", String(serverKnowledge));
    }
  }

  return {
    async getUser() {
      const response = await authorizedFetch(`${baseUrl}/user`);
      const payload = await getJson<YnabUserResponse>(
        response,
        YnabUserResponseSchema,
      );

      return {
        id: payload.data.user.id,
        name: payload.data.user.name ?? payload.data.user.id,
      };
    },
    async listPlans() {
      const response = await authorizedFetch(`${baseUrl}/plans`);
      const payload = await getJson<YnabPlansResponse>(
        response,
        YnabPlansResponseSchema,
      );

      return {
        plans: payload.data.plans.map((plan) =>
          compact({
            id: plan.id,
            name: plan.name,
            lastModifiedOn: plan.last_modified_on,
          }),
        ),
        defaultPlan: payload.data.default_plan
          ? {
              id: payload.data.default_plan.id,
              name: payload.data.default_plan.name,
            }
          : null,
      };
    },
    async getPlan(planId: string) {
      const response = await authorizedFetch(
        `${baseUrl}/plans/${encodeURIComponent(planId)}`,
      );
      const payload = await getJson<YnabPlanResponse>(
        response,
        YnabPlanResponseSchema,
      );
      const plan = payload.data.plan;

      return compact({
        id: plan.id,
        name: plan.name,
        lastModifiedOn: plan.last_modified_on,
        firstMonth: plan.first_month,
        lastMonth: plan.last_month,
        accountCount: Array.isArray(plan.accounts)
          ? plan.accounts.length
          : undefined,
        categoryGroupCount: Array.isArray(plan.category_groups)
          ? plan.category_groups.length
          : undefined,
        payeeCount: Array.isArray(plan.payees) ? plan.payees.length : undefined,
      });
    },
    async listCategories(planId: string) {
      const response = await authorizedFetch(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/categories`,
      );
      const payload = await getJson<YnabCategoriesResponse>(
        response,
        YnabCategoriesResponseSchema,
      );

      return payload.data.category_groups.map((group) => ({
        id: group.id,
        name: group.name,
        hidden: group.hidden,
        deleted: group.deleted,
        categories: group.categories.map(toYnabCategory),
      }));
    },
    async getCategory(planId: string, categoryId: string) {
      const response = await authorizedFetch(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/categories/${encodeURIComponent(categoryId)}`,
      );
      const payload = await getJson<YnabCategoryResponse>(
        response,
        YnabCategoryResponseSchema,
      );
      const category = payload.data.category;

      return compact({
        id: category.id,
        name: category.name,
        hidden: category.hidden,
        categoryGroupName: category.category_group_name,
        balance: category.balance,
        goalType: category.goal_type,
        goalTarget: category.goal_target,
      });
    },
    async getMonthCategory(planId: string, month: string, categoryId: string) {
      const response = await authorizedFetch(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/months/${encodeURIComponent(month)}/categories/${encodeURIComponent(categoryId)}`,
      );
      const payload = await getJson<YnabCategoryResponse>(
        response,
        YnabCategoryResponseSchema,
      );
      const category = payload.data.category;

      return compact({
        id: category.id,
        name: category.name,
        hidden: category.hidden,
        categoryGroupName: category.category_group_name,
        budgeted: category.budgeted,
        activity: category.activity,
        balance: category.balance,
        goalType: category.goal_type,
        goalTarget: category.goal_target,
        goalUnderFunded: category.goal_under_funded,
      });
    },
    async getPlanSettings(planId: string) {
      const response = await authorizedFetch(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/settings`,
      );
      const payload = await getJson<YnabPlanSettingsResponse>(
        response,
        YnabPlanSettingsResponseSchema,
      );
      const settings = payload.data.settings;

      return compact({
        dateFormat: settings.date_format
          ? {
              format: settings.date_format.format,
            }
          : undefined,
        currencyFormat: settings.currency_format
          ? compact({
              isoCode: settings.currency_format.iso_code,
              exampleFormat: settings.currency_format.example_format,
              decimalDigits: settings.currency_format.decimal_digits,
              decimalSeparator: settings.currency_format.decimal_separator,
              symbolFirst: settings.currency_format.symbol_first,
              groupSeparator: settings.currency_format.group_separator,
              currencySymbol: settings.currency_format.currency_symbol,
              displaySymbol: settings.currency_format.display_symbol,
            })
          : undefined,
      });
    },
    async listPlanMonths(planId: string) {
      const response = await authorizedFetch(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/months`,
      );
      const payload = await getJson<YnabPlanMonthsResponse>(
        response,
        YnabPlanMonthsResponseSchema,
      );

      return payload.data.months.map((month) =>
        compact({
          month: month.month,
          income: month.income,
          budgeted: month.budgeted,
          activity: month.activity,
          toBeBudgeted: month.to_be_budgeted,
          deleted: month.deleted,
        }),
      );
    },
    async getPlanMonth(planId: string, month: string) {
      const response = await authorizedFetch(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/months/${encodeURIComponent(month)}`,
      );
      const payload = await getJson<YnabPlanMonthResponse>(
        response,
        YnabPlanMonthResponseSchema,
      );
      const monthDetail = payload.data.month;

      return compact({
        month: monthDetail.month,
        income: monthDetail.income,
        budgeted: monthDetail.budgeted,
        activity: monthDetail.activity,
        toBeBudgeted: monthDetail.to_be_budgeted,
        ageOfMoney: monthDetail.age_of_money,
        categoryCount: Array.isArray(monthDetail.categories)
          ? monthDetail.categories.length
          : undefined,
        categories: monthDetail.categories?.map((category) =>
          compact({
            id: category.id,
            name: category.name,
            budgeted: category.budgeted,
            activity: category.activity,
            balance: category.balance,
            deleted: category.deleted,
            hidden: category.hidden,
            goalUnderFunded: category.goal_under_funded,
            categoryGroupName: category.category_group_name,
          }),
        ),
      });
    },
    async listAccounts(planId: string) {
      const response = await authorizedFetch(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/accounts`,
      );
      const payload = await getJson<YnabAccountsResponse>(
        response,
        YnabAccountsResponseSchema,
      );

      return payload.data.accounts.map(toYnabAccount);
    },
    async getAccount(planId: string, accountId: string) {
      const response = await authorizedFetch(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/accounts/${encodeURIComponent(accountId)}`,
      );
      const payload = await getJson<YnabAccountResponse>(
        response,
        YnabAccountResponseSchema,
      );
      const account = payload.data.account;

      return compact({
        id: account.id,
        name: account.name,
        type: account.type,
        onBudget: account.on_budget,
        closed: account.closed,
        balance: account.balance,
      });
    },
    async listTransactions(planId: string, fromDate?: string, toDate?: string) {
      const url = new URL(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/transactions`,
      );

      if (fromDate) {
        url.searchParams.set("since_date", fromDate);
      }

      const response = await authorizedFetch(url.toString());
      const payload = await getJson<YnabTransactionsResponse>(
        response,
        YnabTransactionsResponseSchema,
      );

      return payload.data.transactions
        .map(toYnabTransaction)
        .filter((transaction) => !toDate || transaction.date <= toDate);
    },
    async listTransactionsByAccount(planId: string, accountId: string) {
      const response = await authorizedFetch(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/accounts/${encodeURIComponent(accountId)}/transactions`,
      );
      const payload = await getJson<YnabTransactionsResponse>(
        response,
        YnabTransactionsResponseSchema,
      );

      return payload.data.transactions.map(toYnabTransaction);
    },
    async listTransactionsByCategory(planId: string, categoryId: string) {
      const response = await authorizedFetch(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/categories/${encodeURIComponent(categoryId)}/transactions`,
      );
      const payload = await getJson<YnabTransactionsResponse>(
        response,
        YnabTransactionsResponseSchema,
      );

      return payload.data.transactions.map(toYnabTransaction);
    },
    async listTransactionsByPayee(planId: string, payeeId: string) {
      const response = await authorizedFetch(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/payees/${encodeURIComponent(payeeId)}/transactions`,
      );
      const payload = await getJson<YnabTransactionsResponse>(
        response,
        YnabTransactionsResponseSchema,
      );

      return payload.data.transactions.map(toYnabTransaction);
    },
    async getTransaction(planId: string, transactionId: string) {
      const response = await authorizedFetch(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/transactions/${encodeURIComponent(transactionId)}`,
      );
      const payload = await getJson<YnabTransactionResponse>(
        response,
        YnabTransactionResponseSchema,
      );

      return toYnabTransaction(payload.data.transaction);
    },
    async listScheduledTransactions(planId: string) {
      const response = await authorizedFetch(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/scheduled_transactions`,
      );
      const payload = await getJson<YnabScheduledTransactionsResponse>(
        response,
        YnabScheduledTransactionsResponseSchema,
      );

      return payload.data.scheduled_transactions.map(
        toYnabScheduledTransaction,
      );
    },
    async getScheduledTransaction(
      planId: string,
      scheduledTransactionId: string,
    ) {
      const response = await authorizedFetch(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/scheduled_transactions/${encodeURIComponent(scheduledTransactionId)}`,
      );
      const payload = await getJson<YnabScheduledTransactionResponse>(
        response,
        YnabScheduledTransactionResponseSchema,
      );

      return toYnabScheduledTransaction(payload.data.scheduled_transaction);
    },
    async listPayees(planId: string) {
      const response = await authorizedFetch(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/payees`,
      );
      const payload = await getJson<YnabPayeesResponse>(
        response,
        YnabPayeesResponseSchema,
      );

      return payload.data.payees.map(toYnabPayee);
    },
    async getPayee(planId: string, payeeId: string) {
      const response = await authorizedFetch(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/payees/${encodeURIComponent(payeeId)}`,
      );
      const payload = await getJson<YnabPayeeResponse>(
        response,
        YnabPayeeResponseSchema,
      );

      return toYnabPayee(payload.data.payee);
    },
    async listPayeeLocations(planId: string) {
      const response = await authorizedFetch(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/payee_locations`,
      );
      const payload = await getJson<YnabPayeeLocationsResponse>(
        response,
        YnabPayeeLocationsResponseSchema,
      );

      return payload.data.payee_locations.map(toYnabPayeeLocation);
    },
    async getPayeeLocation(planId: string, payeeLocationId: string) {
      const response = await authorizedFetch(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/payee_locations/${encodeURIComponent(payeeLocationId)}`,
      );
      const payload = await getJson<YnabPayeeLocationResponse>(
        response,
        YnabPayeeLocationResponseSchema,
      );

      return toYnabPayeeLocation(payload.data.payee_location);
    },
    async getPayeeLocationsByPayee(planId: string, payeeId: string) {
      const response = await authorizedFetch(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/payees/${encodeURIComponent(payeeId)}/payee_locations`,
      );
      const payload = await getJson<YnabPayeeLocationsResponse>(
        response,
        YnabPayeeLocationsResponseSchema,
      );

      return payload.data.payee_locations.map(toYnabPayeeLocation);
    },
    async listMoneyMovements(planId: string, serverKnowledge?: number) {
      const url = new URL(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/money_movements`,
      );
      applyServerKnowledge(url, serverKnowledge);
      const response = await authorizedFetch(url.toString());
      const payload = await getJson<YnabMoneyMovementsResponse>(
        response,
        YnabMoneyMovementsResponseSchema,
      );

      return {
        moneyMovements: payload.data.money_movements.map(toYnabMoneyMovement),
        serverKnowledge: payload.data.server_knowledge,
      };
    },
    async listMoneyMovementGroups(planId: string, serverKnowledge?: number) {
      const url = new URL(
        `${baseUrl}/plans/${encodeURIComponent(planId)}/money_movement_groups`,
      );
      applyServerKnowledge(url, serverKnowledge);
      const response = await authorizedFetch(url.toString());
      const payload = await getJson<YnabMoneyMovementGroupsResponse>(
        response,
        YnabMoneyMovementGroupsResponseSchema,
      );

      return {
        moneyMovementGroups: payload.data.money_movement_groups.map(
          toYnabMoneyMovementGroup,
        ),
        serverKnowledge: payload.data.server_knowledge,
      };
    },
  };
}
