import {
  YnabClientError,
  type YnabAccountSummary,
  type YnabCategoryGroupSummary,
  type YnabClient,
  type YnabMoneyMovement,
  type YnabMoneyMovementGroup,
  type YnabPayee,
  type YnabPayeeLocation,
  type YnabPlanDetail,
  type YnabPlanMonthDetail,
  type YnabPlanSettings,
  type YnabScheduledTransaction,
  type YnabTransaction,
  type YnabUser
} from "../client.js";
import type { YnabDeltaTransactionRecord } from "../delta-client.js";

type InitialPopulationRepository = {
  upsertUser(input: { user: YnabUser; syncedAt: string }): Promise<{ rowsUpserted: number }>;
  upsertPlans(input: { plans: YnabPlanDetail[]; syncedAt: string }): Promise<{ rowsUpserted: number }>;
  upsertPlanSettings(input: {
    planId: string;
    settings: YnabPlanSettings;
    syncedAt: string;
  }): Promise<{ rowsUpserted: number }>;
  upsertAccounts(input: {
    planId: string;
    accounts: YnabAccountSummary[];
    syncedAt: string;
  }): Promise<{ rowsUpserted: number }>;
  upsertCategoryGroups(input: {
    planId: string;
    categoryGroups: YnabCategoryGroupSummary[];
    syncedAt: string;
  }): Promise<{ categoryGroupsUpserted: number; categoriesUpserted: number }>;
  upsertMonths(input: {
    planId: string;
    months: YnabPlanMonthDetail[];
    syncedAt: string;
  }): Promise<{ monthsUpserted: number; monthCategoriesUpserted: number }>;
  upsertPayees(input: {
    planId: string;
    payees: YnabPayee[];
    syncedAt: string;
  }): Promise<{ rowsUpserted: number }>;
  upsertPayeeLocations(input: {
    planId: string;
    locations: YnabPayeeLocation[];
    syncedAt: string;
  }): Promise<{ rowsUpserted: number }>;
  upsertScheduledTransactions(input: {
    planId: string;
    scheduledTransactions: YnabScheduledTransaction[];
    syncedAt: string;
  }): Promise<{ rowsUpserted: number }>;
  upsertMoneyMovements(input: {
    planId: string;
    moneyMovements: YnabMoneyMovement[];
    syncedAt: string;
  }): Promise<{ rowsUpserted: number }>;
  upsertMoneyMovementGroups(input: {
    planId: string;
    moneyMovementGroups: YnabMoneyMovementGroup[];
    syncedAt: string;
  }): Promise<{ rowsUpserted: number }>;
};

type TransactionsRepository = {
  upsertTransactions(input: {
    planId: string;
    transactions: YnabDeltaTransactionRecord[];
    syncedAt: string;
  }): Promise<{ rowsUpserted: number; rowsDeleted: number }>;
};

type SyncStateRepository = {
  acquireLease(input: {
    planId: string;
    endpoint: string;
    leaseOwner: string;
    leaseSeconds: number;
    now: string;
  }): Promise<
    | { acquired: true; leaseExpiresAt: string }
    | { acquired: false; reason: "lease_active" | "contention" }
  >;
  advanceCursor(input: {
    planId: string;
    endpoint: string;
    leaseOwner: string;
    previousServerKnowledge: number | null;
    serverKnowledge: number;
    rowsUpserted: number;
    rowsDeleted: number;
    now: string;
  }): Promise<
    | { advanced: true }
    | { advanced: false; reason: "contention" }
  >;
};

export type InitialPopulationRows = {
  accounts: number;
  categoryGroups: number;
  categories: number;
  moneyMovementGroups: number;
  moneyMovements: number;
  monthCategories: number;
  months: number;
  payeeLocations: number;
  payees: number;
  planSettings: number;
  plans: number;
  scheduledTransactions: number;
  transactions: number;
  transactionTombstones: number;
  users: number;
};

export type InitialPopulationInput = {
  confirm?: boolean;
  dryRun?: boolean;
  includeAllPlans?: boolean;
  maxRequests?: number;
  planId?: string;
};

export type InitialPopulationResult = {
  dryRun: boolean;
  error?: string;
  planIds: string[];
  requestsUsed: number;
  rows: InitialPopulationRows;
  status: "failed" | "ok";
};

type InitialPopulationServiceOptions = {
  defaultPlanId?: string;
  initialPopulationRepository: InitialPopulationRepository;
  maxRequests: number;
  now?: () => string;
  syncStateRepository?: SyncStateRepository;
  transactionsRepository: TransactionsRepository;
  ynabClient: YnabClient;
};

class RequestBudgetExceededError extends Error {
  constructor(readonly maxRequests: number) {
    super(`Initial population stopped before exceeding the request budget of ${maxRequests}.`);
    this.name = "RequestBudgetExceededError";
  }
}

function emptyRows(): InitialPopulationRows {
  return {
    accounts: 0,
    categoryGroups: 0,
    categories: 0,
    moneyMovementGroups: 0,
    moneyMovements: 0,
    monthCategories: 0,
    months: 0,
    payeeLocations: 0,
    payees: 0,
    planSettings: 0,
    plans: 0,
    scheduledTransactions: 0,
    transactions: 0,
    transactionTombstones: 0,
    users: 0
  };
}

function addRows(rows: InitialPopulationRows, additions: Partial<InitialPopulationRows>) {
  for (const [key, value] of Object.entries(additions) as Array<[keyof InitialPopulationRows, number | undefined]>) {
    rows[key] += value ?? 0;
  }
}

function toDeltaTransaction(transaction: YnabTransaction): YnabDeltaTransactionRecord {
  return {
    account_id: transaction.accountId ?? null,
    account_name: transaction.accountName ?? null,
    amount: transaction.amount,
    approved: transaction.approved,
    category_id: transaction.categoryId ?? null,
    category_name: transaction.categoryName ?? null,
    cleared: transaction.cleared,
    date: transaction.date,
    debt_transaction_type: transaction.debtTransactionType ?? null,
    deleted: transaction.deleted,
    flag_color: transaction.flagColor ?? null,
    flag_name: transaction.flagName ?? null,
    id: transaction.id,
    import_id: transaction.importId ?? null,
    import_payee_name: transaction.importPayeeName ?? null,
    import_payee_name_original: transaction.importPayeeNameOriginal ?? null,
    matched_transaction_id: transaction.matchedTransactionId ?? null,
    memo: transaction.memo ?? null,
    payee_id: transaction.payeeId ?? null,
    payee_name: transaction.payeeName ?? null,
    subtransactions: transaction.subtransactions?.map((subtransaction) => ({
      amount: subtransaction.amount,
      category_id: subtransaction.categoryId ?? null,
      category_name: subtransaction.categoryName ?? null,
      deleted: subtransaction.deleted,
      id: subtransaction.id,
      memo: subtransaction.memo ?? null,
      payee_id: subtransaction.payeeId ?? null,
      payee_name: subtransaction.payeeName ?? null,
      transaction_id: subtransaction.transactionId ?? transaction.id,
      transfer_account_id: subtransaction.transferAccountId ?? null,
      transfer_transaction_id: subtransaction.transferTransactionId ?? null
    })),
    transfer_account_id: transaction.transferAccountId ?? null,
    transfer_transaction_id: transaction.transferTransactionId ?? null
  };
}

function isRateLimitError(error: unknown) {
  return error instanceof YnabClientError && error.category === "rate_limit";
}

export function createInitialPopulationService(options: InitialPopulationServiceOptions) {
  return {
    async populate(input: InitialPopulationInput = {}): Promise<InitialPopulationResult> {
      const dryRun = input.dryRun ?? !input.confirm;
      const maxRequests = input.maxRequests ?? options.maxRequests;
      const rows = emptyRows();
      let requestsUsed = 0;
      let planIds: string[] = [];

      type PerPlanPayload = {
        accounts: YnabAccountSummary[];
        categoryGroups: YnabCategoryGroupSummary[];
        locations: YnabPayeeLocation[];
        moneyMovementGroups: YnabMoneyMovementGroup[];
        moneyMovementServerKnowledge?: number;
        moneyMovements: YnabMoneyMovement[];
        months: YnabPlanMonthDetail[];
        payees: YnabPayee[];
        plan: YnabPlanDetail;
        serverKnowledge?: number;
        scheduledTransactions: YnabScheduledTransaction[];
        settings: YnabPlanSettings;
        transactions: YnabTransaction[];
      };

      async function callYnab<T>(request: () => Promise<T>) {
        if (requestsUsed >= maxRequests) {
          throw new RequestBudgetExceededError(maxRequests);
        }

        requestsUsed += 1;

        return request();
      }

      async function writeFetchedData(input: {
        syncedAt: string;
        user?: YnabUser;
        planDetails: YnabPlanDetail[];
        perPlanPayloads: PerPlanPayload[];
      }) {
        if (input.user) {
          const userResult = await options.initialPopulationRepository.upsertUser({
            syncedAt: input.syncedAt,
            user: input.user
          });
          addRows(rows, { users: userResult.rowsUpserted });
        }

        const plansResult = await options.initialPopulationRepository.upsertPlans({
          plans: input.planDetails,
          syncedAt: input.syncedAt
        });
        addRows(rows, { plans: plansResult.rowsUpserted });

        for (const payload of input.perPlanPayloads) {
          const settingsResult = await options.initialPopulationRepository.upsertPlanSettings({
            planId: payload.plan.id,
            settings: payload.settings,
            syncedAt: input.syncedAt
          });
          const accountsResult = await options.initialPopulationRepository.upsertAccounts({
            accounts: payload.accounts,
            planId: payload.plan.id,
            syncedAt: input.syncedAt
          });
          const categoriesResult = await options.initialPopulationRepository.upsertCategoryGroups({
            categoryGroups: payload.categoryGroups,
            planId: payload.plan.id,
            syncedAt: input.syncedAt
          });
          const monthsResult = await options.initialPopulationRepository.upsertMonths({
            months: payload.months,
            planId: payload.plan.id,
            syncedAt: input.syncedAt
          });
          const payeesResult = await options.initialPopulationRepository.upsertPayees({
            payees: payload.payees,
            planId: payload.plan.id,
            syncedAt: input.syncedAt
          });
          const locationsResult = await options.initialPopulationRepository.upsertPayeeLocations({
            locations: payload.locations,
            planId: payload.plan.id,
            syncedAt: input.syncedAt
          });
          const scheduledTransactionsResult = await options.initialPopulationRepository.upsertScheduledTransactions({
            planId: payload.plan.id,
            scheduledTransactions: payload.scheduledTransactions,
            syncedAt: input.syncedAt
          });
          const transactionsResult = await options.transactionsRepository.upsertTransactions({
            planId: payload.plan.id,
            syncedAt: input.syncedAt,
            transactions: payload.transactions.map(toDeltaTransaction)
          });
          const moneyMovementsResult = await options.initialPopulationRepository.upsertMoneyMovements({
            moneyMovements: payload.moneyMovements,
            planId: payload.plan.id,
            syncedAt: input.syncedAt
          });
          const moneyMovementGroupsResult = await options.initialPopulationRepository.upsertMoneyMovementGroups({
            moneyMovementGroups: payload.moneyMovementGroups,
            planId: payload.plan.id,
            syncedAt: input.syncedAt
          });

          addRows(rows, {
            accounts: accountsResult.rowsUpserted,
            categories: categoriesResult.categoriesUpserted,
            categoryGroups: categoriesResult.categoryGroupsUpserted,
            moneyMovementGroups: moneyMovementGroupsResult.rowsUpserted,
            moneyMovements: moneyMovementsResult.rowsUpserted,
            monthCategories: monthsResult.monthCategoriesUpserted,
            months: monthsResult.monthsUpserted,
            payeeLocations: locationsResult.rowsUpserted,
            payees: payeesResult.rowsUpserted,
            planSettings: settingsResult.rowsUpserted,
            scheduledTransactions: scheduledTransactionsResult.rowsUpserted,
            transactions: transactionsResult.rowsUpserted,
            transactionTombstones: transactionsResult.rowsDeleted
          });

          if (payload.serverKnowledge !== undefined) {
            const endpointRows = {
              plans: plansResult.rowsUpserted,
              plan_settings: settingsResult.rowsUpserted,
              accounts: accountsResult.rowsUpserted,
              categories: categoriesResult.categoryGroupsUpserted + categoriesResult.categoriesUpserted,
              months: monthsResult.monthsUpserted + monthsResult.monthCategoriesUpserted,
              payees: payeesResult.rowsUpserted,
              payee_locations: locationsResult.rowsUpserted,
              scheduled_transactions: scheduledTransactionsResult.rowsUpserted,
              transactions: transactionsResult.rowsUpserted
            };

            for (const [endpoint, rowsUpserted] of Object.entries(endpointRows)) {
              await seedSyncCursor({
                endpoint,
                planId: payload.plan.id,
                rowsDeleted: endpoint === "transactions" ? transactionsResult.rowsDeleted : 0,
                rowsUpserted,
                serverKnowledge: payload.serverKnowledge,
                syncedAt: input.syncedAt
              });
            }
          }

          if (payload.moneyMovementServerKnowledge !== undefined) {
            await seedSyncCursor({
              endpoint: "money_movements",
              planId: payload.plan.id,
              rowsDeleted: 0,
              rowsUpserted: moneyMovementsResult.rowsUpserted + moneyMovementGroupsResult.rowsUpserted,
              serverKnowledge: payload.moneyMovementServerKnowledge,
              syncedAt: input.syncedAt
            });
          }
        }
      }

      async function seedSyncCursor(input: {
        endpoint: string;
        planId: string;
        rowsDeleted: number;
        rowsUpserted: number;
        serverKnowledge: number;
        syncedAt: string;
      }) {
        if (!options.syncStateRepository) {
          return;
        }

        const leaseOwner = `initial-population:${input.syncedAt}`;
        const lease = await options.syncStateRepository.acquireLease({
          endpoint: input.endpoint,
          leaseOwner,
          leaseSeconds: 60,
          now: input.syncedAt,
          planId: input.planId
        });

        if (!lease.acquired) {
          return;
        }

        await options.syncStateRepository.advanceCursor({
          endpoint: input.endpoint,
          leaseOwner,
          now: input.syncedAt,
          planId: input.planId,
          previousServerKnowledge: null,
          rowsDeleted: input.rowsDeleted,
          rowsUpserted: input.rowsUpserted,
          serverKnowledge: input.serverKnowledge
        });
      }

      try {
        const syncedAt = options.now?.() ?? new Date().toISOString();
        const directPlanId = input.planId ?? options.defaultPlanId;

        if (options.ynabClient.getPlanExport) {
          let selectedPlanIds: string[];

          if (input.includeAllPlans) {
            selectedPlanIds = (await callYnab(() => options.ynabClient.listPlans())).plans.map((plan) => plan.id);
          } else if (directPlanId) {
            selectedPlanIds = [directPlanId];
          } else {
            const planList = await callYnab(() => options.ynabClient.listPlans());
            const discoveredPlanId = planList.defaultPlan?.id ?? planList.plans[0]?.id;

            if (!discoveredPlanId) {
              throw new Error("No YNAB plans were available for initial population.");
            }

            selectedPlanIds = [discoveredPlanId];
          }
          const exports = [];

          for (const planId of selectedPlanIds) {
            const planExport = await callYnab(() => options.ynabClient.getPlanExport!(planId));
            const moneyMovementsResult = options.ynabClient.listMoneyMovements
              ? await callYnab(() => options.ynabClient.listMoneyMovements!(planExport.plan.id))
              : { moneyMovements: [], serverKnowledge: undefined };
            const moneyMovementGroupsResult = options.ynabClient.listMoneyMovementGroups
              ? await callYnab(() => options.ynabClient.listMoneyMovementGroups!(planExport.plan.id))
              : { moneyMovementGroups: [], serverKnowledge: undefined };

            exports.push({
              moneyMovementGroups: moneyMovementGroupsResult.moneyMovementGroups,
              moneyMovementServerKnowledge: [
                moneyMovementsResult.serverKnowledge,
                moneyMovementGroupsResult.serverKnowledge
              ].filter((serverKnowledge): serverKnowledge is number => typeof serverKnowledge === "number")
                .sort((left, right) => right - left)[0],
              moneyMovements: moneyMovementsResult.moneyMovements,
              planExport
            });
          }

          const perPlanPayloads = exports.map(({ moneyMovementGroups, moneyMovementServerKnowledge, moneyMovements, planExport }) => ({
            accounts: planExport.plan.accounts,
            categoryGroups: planExport.plan.categoryGroups,
            locations: planExport.plan.payeeLocations,
            moneyMovementGroups,
            moneyMovementServerKnowledge,
            moneyMovements,
            months: planExport.plan.months,
            payees: planExport.plan.payees,
            plan: planExport.plan,
            serverKnowledge: planExport.serverKnowledge,
            scheduledTransactions: planExport.plan.scheduledTransactions,
            settings: {},
            transactions: planExport.plan.transactions
          }));
          const planDetails = exports.map(({ planExport }) => planExport.plan);

          planIds = planDetails.map((plan) => plan.id);

          if (!dryRun) {
            await writeFetchedData({
              perPlanPayloads,
              planDetails,
              syncedAt
            });
          }

          return {
            dryRun,
            planIds,
            requestsUsed,
            rows,
            status: "ok"
          };
        }

        const user = await callYnab(() => options.ynabClient.getUser());
        let selectedPlanIds = [
          input.planId
            ?? options.defaultPlanId
        ].filter((planId): planId is string => typeof planId === "string");

        if (input.includeAllPlans || selectedPlanIds.length === 0) {
          const planList = await callYnab(() => options.ynabClient.listPlans());

          selectedPlanIds = input.includeAllPlans
            ? planList.plans.map((plan) => plan.id)
            : [
                planList.defaultPlan?.id
                  ?? planList.plans[0]?.id
              ].filter((planId): planId is string => typeof planId === "string");
        }

        planIds = selectedPlanIds;

        const planDetails: YnabPlanDetail[] = [];
        const perPlanPayloads: PerPlanPayload[] = [];

        for (const planId of selectedPlanIds) {
          const plan = await callYnab(() => options.ynabClient.getPlan(planId));
          const settings = await callYnab(() => options.ynabClient.getPlanSettings(planId));
          const accounts = await callYnab(() => options.ynabClient.listAccounts(planId));
          const categoryGroups = await callYnab(() => options.ynabClient.listCategories(planId));
          const monthSummaries = await callYnab(() => options.ynabClient.listPlanMonths(planId));
          const months: YnabPlanMonthDetail[] = [];

          for (const monthSummary of monthSummaries) {
            months.push(await callYnab(() => options.ynabClient.getPlanMonth(planId, monthSummary.month)));
          }

          const payees = await callYnab(() => options.ynabClient.listPayees(planId));
          const locations = await callYnab(() => options.ynabClient.listPayeeLocations(planId));
          const scheduledTransactions = await callYnab(() => options.ynabClient.listScheduledTransactions(planId));
          const transactions = await callYnab(() => options.ynabClient.listTransactions(planId));
          const moneyMovements = options.ynabClient.listMoneyMovements
            ? (await callYnab(() => options.ynabClient.listMoneyMovements!(planId))).moneyMovements
            : [];
          const moneyMovementGroups = options.ynabClient.listMoneyMovementGroups
            ? (await callYnab(() => options.ynabClient.listMoneyMovementGroups!(planId))).moneyMovementGroups
            : [];

          planDetails.push(plan);
          perPlanPayloads.push({
            accounts,
            categoryGroups,
            locations,
            moneyMovementGroups,
            moneyMovements,
            months,
            payees,
            plan,
            scheduledTransactions,
            settings,
            transactions
          });
        }

        if (!dryRun) {
          await writeFetchedData({
            perPlanPayloads,
            planDetails,
            syncedAt,
            user
          });
        }

        return {
          dryRun,
          planIds,
          requestsUsed,
          rows,
          status: "ok"
        };
      } catch (error) {
        return {
          dryRun,
          error: isRateLimitError(error)
            ? "YNAB API rate limit reached. Stop and retry after the rolling hourly window has capacity."
            : error instanceof Error
              ? error.message
              : "Initial population failed.",
          planIds,
          requestsUsed,
          rows,
          status: "failed"
        };
      }
    }
  };
}
