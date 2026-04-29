import { z } from "zod";

import {
  groupCategoriesByGroupId,
  toYnabAccount,
  toYnabCategory,
  toYnabCategoryGroup,
  toYnabMonth,
  toYnabPayee,
  toYnabPayeeLocation,
  toYnabScheduledTransaction,
  YnabClientError,
  type YnabAccountRecord,
  type YnabAccountSummary,
  type YnabCategoryGroupRecord,
  type YnabCategoryGroupSummary,
  type YnabCategoryRecord,
  type YnabPayee,
  type YnabPayeeLocation,
  type YnabPayeeLocationRecord,
  type YnabPayeeRecord,
  type YnabPlanMonthDetail,
  type YnabPlanMonthRecord,
  type YnabScheduledTransaction,
  type YnabScheduledTransactionRecord,
} from "./client.js";

export type YnabDeltaResponse<TRecord> = {
  serverKnowledge: number;
  records: TRecord[];
};

export type YnabDeltaTransactionRecord = {
  id: string;
  date: string;
  amount: number;
  memo?: string | null;
  cleared?: string | null;
  approved?: boolean | null;
  flag_color?: string | null;
  flag_name?: string | null;
  account_id?: string | null;
  account_name?: string | null;
  payee_id?: string | null;
  payee_name?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  transfer_account_id?: string | null;
  transfer_transaction_id?: string | null;
  matched_transaction_id?: string | null;
  import_id?: string | null;
  import_payee_name?: string | null;
  import_payee_name_original?: string | null;
  debt_transaction_type?: string | null;
  subtransactions?: YnabDeltaSubtransactionRecord[];
  deleted?: boolean;
};

export type YnabDeltaSubtransactionRecord = {
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

export interface YnabDeltaClient {
  listAccountsDelta(
    planId: string,
    serverKnowledge?: number,
  ): Promise<YnabDeltaResponse<YnabAccountSummary>>;
  listCategoriesDelta(
    planId: string,
    serverKnowledge?: number,
  ): Promise<YnabDeltaResponse<YnabCategoryGroupSummary>>;
  listMonthsDelta(
    planId: string,
    serverKnowledge?: number,
  ): Promise<YnabDeltaResponse<YnabPlanMonthDetail>>;
  listPayeesDelta(
    planId: string,
    serverKnowledge?: number,
  ): Promise<YnabDeltaResponse<YnabPayee>>;
  listPayeeLocationsDelta(
    planId: string,
    serverKnowledge?: number,
  ): Promise<YnabDeltaResponse<YnabPayeeLocation>>;
  listScheduledTransactionsDelta(
    planId: string,
    serverKnowledge?: number,
  ): Promise<YnabDeltaResponse<YnabScheduledTransaction>>;
  listTransactionsDelta(
    planId: string,
    serverKnowledge?: number,
  ): Promise<YnabDeltaResponse<YnabDeltaTransactionRecord>>;
}

type CreateYnabDeltaClientOptions = {
  accessToken: string;
  baseUrl: string;
  fetchFn?: typeof fetch;
};

const YNAB_REQUEST_ATTEMPTS = 2;

type YnabDeltaEnvelope<TDataKey extends string, TRecord> = {
  data: {
    server_knowledge: number;
  } & Record<TDataKey, TRecord[]>;
};

type YnabCategoriesDeltaEnvelope = {
  data: {
    server_knowledge: number;
    category_groups: YnabCategoryGroupRecord[];
    categories?: YnabCategoryRecord[];
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

const deltaEnvelopeSchema = <TDataKey extends string>(dataKey: TDataKey) =>
  z
    .object({
      data: z
        .object({
          server_knowledge: z.number(),
          [dataKey]: z.array(z.unknown()),
        })
        .passthrough(),
    })
    .passthrough() as unknown as z.ZodType<
    YnabDeltaEnvelope<TDataKey, unknown>
  >;

const YnabCategoriesDeltaEnvelopeSchema = z
  .object({
    data: z
      .object({
        server_knowledge: z.number(),
        category_groups: z.array(z.unknown()),
        categories: z.array(z.unknown()).optional(),
      })
      .passthrough(),
  })
  .passthrough() as z.ZodType<YnabCategoriesDeltaEnvelope>;

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

function applyServerKnowledge(url: URL, serverKnowledge: number | undefined) {
  if (serverKnowledge !== undefined) {
    url.searchParams.set("last_knowledge_of_server", String(serverKnowledge));
  }
}

export function createYnabDeltaClient(
  options: CreateYnabDeltaClientOptions,
): YnabDeltaClient {
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

  async function getDelta<TDataKey extends string, TRecord>(
    planId: string,
    endpoint: string,
    dataKey: TDataKey,
    serverKnowledge: number | undefined,
  ): Promise<YnabDeltaResponse<TRecord>> {
    const url = new URL(
      `${baseUrl}/plans/${encodeURIComponent(planId)}/${endpoint}`,
    );
    applyServerKnowledge(url, serverKnowledge);

    const response = await authorizedFetch(url.toString());
    const payload = await getJson<YnabDeltaEnvelope<TDataKey, TRecord>>(
      response,
      deltaEnvelopeSchema(dataKey),
    );

    return {
      serverKnowledge: payload.data.server_knowledge,
      records: payload.data[dataKey],
    };
  }

  async function getMappedDelta<
    TDataKey extends string,
    TRecord,
    TMappedRecord,
  >(
    planId: string,
    endpoint: string,
    dataKey: TDataKey,
    serverKnowledge: number | undefined,
    mapRecord: (record: TRecord) => TMappedRecord,
  ): Promise<YnabDeltaResponse<TMappedRecord>> {
    const delta = await getDelta<TDataKey, TRecord>(
      planId,
      endpoint,
      dataKey,
      serverKnowledge,
    );

    return {
      records: delta.records.map(mapRecord),
      serverKnowledge: delta.serverKnowledge,
    };
  }

  async function listCategoriesDelta(
    planId: string,
    serverKnowledge: number | undefined,
  ) {
    const url = new URL(
      `${baseUrl}/plans/${encodeURIComponent(planId)}/categories`,
    );
    applyServerKnowledge(url, serverKnowledge);

    const response = await authorizedFetch(url.toString());
    const payload = await getJson<YnabCategoriesDeltaEnvelope>(
      response,
      YnabCategoriesDeltaEnvelopeSchema,
    );
    const categories = (payload.data.categories ?? []).map(toYnabCategory);
    const categoriesByGroupId = groupCategoriesByGroupId(categories);

    return {
      records: payload.data.category_groups.map((group) =>
        toYnabCategoryGroup(group, categoriesByGroupId),
      ),
      serverKnowledge: payload.data.server_knowledge,
    };
  }

  return {
    listAccountsDelta(planId, serverKnowledge) {
      return getMappedDelta<"accounts", YnabAccountRecord, YnabAccountSummary>(
        planId,
        "accounts",
        "accounts",
        serverKnowledge,
        toYnabAccount,
      );
    },
    listCategoriesDelta,
    listMonthsDelta(planId, serverKnowledge) {
      return getMappedDelta<"months", YnabPlanMonthRecord, YnabPlanMonthDetail>(
        planId,
        "months",
        "months",
        serverKnowledge,
        toYnabMonth,
      );
    },
    listPayeesDelta(planId, serverKnowledge) {
      return getMappedDelta<"payees", YnabPayeeRecord, YnabPayee>(
        planId,
        "payees",
        "payees",
        serverKnowledge,
        toYnabPayee,
      );
    },
    listPayeeLocationsDelta(planId, serverKnowledge) {
      return getMappedDelta<
        "payee_locations",
        YnabPayeeLocationRecord,
        YnabPayeeLocation
      >(
        planId,
        "payee_locations",
        "payee_locations",
        serverKnowledge,
        toYnabPayeeLocation,
      );
    },
    listScheduledTransactionsDelta(planId, serverKnowledge) {
      return getMappedDelta<
        "scheduled_transactions",
        YnabScheduledTransactionRecord,
        YnabScheduledTransaction
      >(
        planId,
        "scheduled_transactions",
        "scheduled_transactions",
        serverKnowledge,
        toYnabScheduledTransaction,
      );
    },
    listTransactionsDelta(planId, serverKnowledge) {
      return getDelta<"transactions", YnabDeltaTransactionRecord>(
        planId,
        "transactions",
        "transactions",
        serverKnowledge,
      );
    },
  };
}
