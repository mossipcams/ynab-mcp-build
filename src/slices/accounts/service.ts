import type { YnabClient } from "../../platform/ynab/client.js";
import {
  formatAmountMilliunits,
  hasPaginationControls,
  hasProjectionControls,
  paginateEntries,
  projectRecord
} from "../../shared/collections.js";
import { compactObject } from "../../shared/object.js";
import { resolvePlanId } from "../../shared/plans.js";

export type ListAccountsInput = {
  planId?: string;
  limit?: number;
  offset?: number;
  fields?: Array<"name" | "type" | "closed" | "balance">;
  includeIds?: boolean;
};

export type GetAccountInput = {
  planId?: string;
  accountId: string;
};

const accountFields = ["name", "type", "closed", "balance"] as const;

export async function listAccounts(ynabClient: YnabClient, input: ListAccountsInput) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const accounts = (await ynabClient.listAccounts(planId))
    .filter((account) => !account.deleted)
    .map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      closed: account.closed,
      balance: formatAmountMilliunits(account.balance)
    }));

  if (!hasPaginationControls(input) && !hasProjectionControls(input)) {
    return {
      accounts,
      account_count: accounts.length
    };
  }

  if (!hasPaginationControls(input)) {
    return {
      accounts: accounts.map((account) => projectRecord(account, accountFields, input)),
      account_count: accounts.length
    };
  }

  const pagedAccounts = paginateEntries(accounts, input);

  return {
    accounts: pagedAccounts.entries.map((account) => projectRecord(account, accountFields, input)),
    account_count: accounts.length,
    ...pagedAccounts.metadata
  };
}

export async function getAccount(ynabClient: YnabClient, input: GetAccountInput) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const account = await ynabClient.getAccount(planId, input.accountId);

  return {
    account: compactObject({
      id: account.id,
      name: account.name,
      type: account.type,
      on_budget: account.onBudget,
      closed: account.closed,
      balance: account.balance == null ? undefined : formatAmountMilliunits(account.balance)
    })
  };
}
