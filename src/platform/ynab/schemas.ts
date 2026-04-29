import { z } from "zod";

const AmountPresentationSchema = z
  .object({
    amount_currency: z.number().optional(),
    amount_formatted: z.string().optional(),
    balance_currency: z.number().optional(),
    balance_formatted: z.string().optional(),
  })
  .partial();

const PlanSummarySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    last_modified_on: z.string().optional(),
  })
  .passthrough();

const AccountSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    closed: z.boolean(),
    deleted: z.boolean().optional(),
    balance: z.number(),
  })
  .merge(AmountPresentationSchema)
  .passthrough();

const CategorySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    hidden: z.boolean(),
    deleted: z.boolean(),
    category_group_name: z.string().optional(),
    goal_type: z.string().optional().nullable(),
    goal_target: z.number().optional().nullable(),
    goal_target_date: z.string().optional().nullable(),
    goal_target_month: z.string().optional().nullable(),
    goal_needs_whole_amount: z.boolean().optional().nullable(),
    goal_snoozed_at: z.string().optional().nullable(),
  })
  .merge(AmountPresentationSchema)
  .passthrough();

const CategoryGroupSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    hidden: z.boolean(),
    deleted: z.boolean(),
    categories: z.array(CategorySchema),
  })
  .passthrough();

const TransactionSchema = z
  .object({
    id: z.string(),
    date: z.string(),
    amount: z.number(),
    memo: z.string().nullable().optional(),
    cleared: z.string().optional(),
    approved: z.boolean().nullable().optional(),
    flag_name: z.string().nullable().optional(),
    account_id: z.string().nullable().optional(),
    account_name: z.string().nullable().optional(),
    payee_id: z.string().nullable().optional(),
    payee_name: z.string().nullable().optional(),
    category_id: z.string().nullable().optional(),
    category_name: z.string().nullable().optional(),
    transfer_account_id: z.string().nullable().optional(),
    deleted: z.boolean().optional(),
  })
  .merge(AmountPresentationSchema)
  .passthrough();

const ScheduledSubtransactionSchema = z
  .object({
    id: z.string().optional(),
    amount: z.number(),
    payee_name: z.string().optional().nullable(),
    category_name: z.string().optional().nullable(),
  })
  .merge(AmountPresentationSchema)
  .passthrough();

const ScheduledTransactionSchema = z
  .object({
    id: z.string(),
    date_first: z.string(),
    date_next: z.string().nullable().optional(),
    frequency: z.string().optional(),
    amount: z.number(),
    payee_name: z.string().optional().nullable(),
    category_name: z.string().optional().nullable(),
    account_name: z.string().optional().nullable(),
    deleted: z.boolean().optional(),
    subtransactions: z.array(ScheduledSubtransactionSchema).optional(),
  })
  .merge(AmountPresentationSchema)
  .passthrough();

export const YnabPlansResponseSchema = z
  .object({
    data: z
      .object({
        plans: z.array(PlanSummarySchema),
        default_plan: z
          .object({
            id: z.string(),
            name: z.string(),
          })
          .optional(),
      })
      .passthrough(),
  })
  .passthrough();

export const YnabAccountsResponseSchema = z
  .object({
    data: z
      .object({
        accounts: z.array(AccountSchema),
      })
      .passthrough(),
  })
  .passthrough();

export const YnabCategoriesResponseSchema = z
  .object({
    data: z
      .object({
        category_groups: z.array(CategoryGroupSchema),
      })
      .passthrough(),
  })
  .passthrough();

export const YnabTransactionsResponseSchema = z
  .object({
    data: z
      .object({
        transactions: z.array(TransactionSchema),
      })
      .passthrough(),
  })
  .passthrough();

export const YnabScheduledTransactionsResponseSchema = z
  .object({
    data: z
      .object({
        scheduled_transactions: z.array(ScheduledTransactionSchema),
      })
      .passthrough(),
  })
  .passthrough();
