import type { YnabClient } from "../../platform/ynab/client.js";
import {
  hasProjectionControls,
  paginateEntries,
  projectRecord,
  shouldPaginateEntries,
} from "../../shared/collections.js";
import { compactObject } from "../../shared/object.js";
import { resolvePlanId } from "../../shared/plans.js";

const payeeFields = ["name", "transfer_account_id"] as const;

export type ListPayeesInput = {
  planId?: string;
  limit?: number;
  offset?: number;
  fields?: Array<(typeof payeeFields)[number]>;
  includeIds?: boolean;
};

export type GetPayeeInput = {
  planId?: string;
  payeeId: string;
};

export type ListPayeeLocationsInput = {
  planId?: string;
};

export type GetPayeeLocationInput = {
  planId?: string;
  payeeLocationId: string;
};

export type GetPayeeLocationsByPayeeInput = {
  planId?: string;
  payeeId: string;
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

export async function getPayee(ynabClient: YnabClient, input: GetPayeeInput) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const payee = await ynabClient.getPayee(planId, input.payeeId);

  return {
    payee: compactObject({
      id: payee.id,
      name: payee.name,
      transfer_account_id: payee.transferAccountId,
    }),
  };
}

export async function listPayeeLocations(
  ynabClient: YnabClient,
  input: ListPayeeLocationsInput,
) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const payeeLocations = (await ynabClient.listPayeeLocations(planId))
    .filter((location) => !location.deleted)
    .map((location) => ({
      id: location.id,
      payee_id: location.payeeId,
      latitude: location.latitude,
      longitude: location.longitude,
    }));

  return {
    payee_locations: payeeLocations,
    payee_location_count: payeeLocations.length,
  };
}

export async function getPayeeLocation(
  ynabClient: YnabClient,
  input: GetPayeeLocationInput,
) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const payeeLocation = await ynabClient.getPayeeLocation(
    planId,
    input.payeeLocationId,
  );

  return {
    payee_location: compactObject({
      id: payeeLocation.id,
      payee_id: payeeLocation.payeeId,
      latitude: payeeLocation.latitude,
      longitude: payeeLocation.longitude,
    }),
  };
}

export async function getPayeeLocationsByPayee(
  ynabClient: YnabClient,
  input: GetPayeeLocationsByPayeeInput,
) {
  const planId = await resolvePlanId(ynabClient, input.planId);
  const payeeLocations = (
    await ynabClient.getPayeeLocationsByPayee(planId, input.payeeId)
  )
    .filter((location) => !location.deleted)
    .map((location) => ({
      id: location.id,
      payee_id: location.payeeId,
      latitude: location.latitude,
      longitude: location.longitude,
    }));

  return {
    payee_locations: payeeLocations,
    payee_location_count: payeeLocations.length,
  };
}
