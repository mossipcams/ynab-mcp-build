import type { YnabClient } from "../../platform/ynab/client.js";
import {
  hasProjectionControls,
  paginateEntries,
  projectRecord,
  shouldPaginateEntries,
} from "../../shared/collections.js";
import { resolvePlanId } from "../../shared/plans.js";

const payeeFields = ["name", "transfer_account_id"] as const;

export type ListPayeesInput = {
  planId?: string;
  limit?: number;
  offset?: number;
  fields?: Array<(typeof payeeFields)[number]>;
  includeIds?: boolean;
};

export async function listPayees(
  ynabClient: YnabClient,
  input: ListPayeesInput,
) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const payees = (await ynabClient.listPayees(planId))
    .filter((payee) => !payee.deleted)
    .map((payee) => ({
      id: payee.id,
      name: payee.name,
      transfer_account_id: payee.transferAccountId,
    }));

  if (!shouldPaginateEntries(payees, input) && !hasProjectionControls(input)) {
    return {
      payees,
      payee_count: payees.length,
    };
  }

  if (!shouldPaginateEntries(payees, input)) {
    return {
      payees: payees.map((payee) => projectRecord(payee, payeeFields, input)),
      payee_count: payees.length,
    };
  }

  const pagedPayees = paginateEntries(payees, input);

  return {
    payees: pagedPayees.entries.map((payee) =>
      projectRecord(payee, payeeFields, input),
    ),
    payee_count: payees.length,
    ...pagedPayees.metadata,
  };
}
