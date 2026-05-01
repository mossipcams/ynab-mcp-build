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
  YnabAccountRecordSchema,
  YnabCategoryGroupRecordSchema,
  YnabCategoryRecordSchema,
  YnabPayeeLocationRecordSchema,
  YnabPayeeRecordSchema,
  YnabPlanMonthRecordSchema,
  YnabScheduledTransactionRecordSchema,
  YnabTransactionRecordSchema,
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

export type YnabDeltaTransactionRecord = z.output<
  typeof YnabTransactionRecordSchema
>;

export type YnabDeltaSubtransactionRecord = z.output<
  typeof YnabTransactionRecordSchema
>["subtransactions"] extends Array<infer TRecord> | undefined
  ? TRecord
  : never;

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
  delay?: (milliseconds: number) => Promise<void>;
  fetchFn?: typeof fetch;
  retryDelayMs?: (input: { attempt: number; status?: number }) => number;
};

const YNAB_REQUEST_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY_MS = 500;

type YnabDeltaEnvelope<TDataKey extends string, TRecord> = {
  data: {
    server_knowledge: number;
  } & Record<TDataKey, TRecord[]>;
};

type YnabOptionalCursorDeltaEnvelope<TDataKey extends string, TRecord> = {
  data: {
    server_knowledge?: number;
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

const deltaEnvelopeSchema = <TDataKey extends string, TRecord>(
  dataKey: TDataKey,
  recordSchema: z.ZodType<TRecord>,
) =>
  z
    .object({
      data: z
        .object({
          server_knowledge: z.number(),
          [dataKey]: z.array(recordSchema),
        })
        .passthrough(),
    })
    // Zod's dynamic object keys lose the literal data key, so this narrows the schema to the constructed key.
    .passthrough() as unknown as z.ZodType<
    YnabDeltaEnvelope<TDataKey, TRecord>
  >;

const optionalCursorDeltaEnvelopeSchema = <TDataKey extends string, TRecord>(
  dataKey: TDataKey,
  recordSchema: z.ZodType<TRecord>,
) =>
  z
    .object({
      data: z
        .object({
          server_knowledge: z.number().optional(),
          [dataKey]: z.array(recordSchema),
        })
        .passthrough(),
    })
    // Zod's dynamic object keys lose the literal data key, so this narrows the schema to the constructed key.
    .passthrough() as unknown as z.ZodType<
    YnabOptionalCursorDeltaEnvelope<TDataKey, TRecord>
  >;

const YnabCategoriesDeltaEnvelopeSchema = z
  .object({
    data: z
      .object({
        server_knowledge: z.number(),
        category_groups: z.array(YnabCategoryGroupRecordSchema),
        categories: z.array(YnabCategoryRecordSchema).optional(),
      })
      .passthrough(),
  })
  .passthrough() as z.ZodType<YnabCategoriesDeltaEnvelope>;

async function getJson<TSchema extends z.ZodType>(
  response: Response,
  schema: TSchema,
): Promise<z.output<TSchema>> {
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

    if (response.status === 401 || response.status === 403) {
      throw new YnabClientError(message, "auth", false);
    }

    if (response.status === 404) {
      throw new YnabClientError(message, "not_found", false);
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

    return result.data;
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
  const delay =
    options.delay ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, milliseconds);
      }));
  const retryDelayMs =
    options.retryDelayMs ??
    ((input: { attempt: number }) =>
      DEFAULT_RETRY_DELAY_MS * 2 ** (input.attempt - 1));
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
          await delay(
            retryDelayMs({
              attempt,
              status: response.status,
            }),
          );
          continue;
        }

        return response;
      } catch (error) {
        if (attempt < YNAB_REQUEST_ATTEMPTS) {
          await delay(
            retryDelayMs({
              attempt,
            }),
          );
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
    recordSchema: z.ZodType<TRecord>,
  ): Promise<YnabDeltaResponse<TRecord>> {
    const url = new URL(
      `${baseUrl}/plans/${encodeURIComponent(planId)}/${endpoint}`,
    );
    applyServerKnowledge(url, serverKnowledge);

    const response = await authorizedFetch(url.toString());
    const payload = await getJson(
      response,
      deltaEnvelopeSchema(dataKey, recordSchema),
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
    recordSchema: z.ZodType<TRecord>,
    mapRecord: (record: TRecord) => TMappedRecord,
  ): Promise<YnabDeltaResponse<TMappedRecord>> {
    const delta = await getDelta<TDataKey, TRecord>(
      planId,
      endpoint,
      dataKey,
      serverKnowledge,
      recordSchema,
    );

    return {
      records: delta.records.map(mapRecord),
      serverKnowledge: delta.serverKnowledge,
    };
  }

  async function getOptionalCursorMappedDelta<
    TDataKey extends string,
    TRecord,
    TMappedRecord,
  >(
    planId: string,
    endpoint: string,
    dataKey: TDataKey,
    serverKnowledge: number | undefined,
    recordSchema: z.ZodType<TRecord>,
    mapRecord: (record: TRecord) => TMappedRecord,
  ): Promise<YnabDeltaResponse<TMappedRecord>> {
    const url = new URL(
      `${baseUrl}/plans/${encodeURIComponent(planId)}/${endpoint}`,
    );
    applyServerKnowledge(url, serverKnowledge);

    const response = await authorizedFetch(url.toString());
    const payload = await getJson(
      response,
      optionalCursorDeltaEnvelopeSchema(dataKey, recordSchema),
    );

    return {
      records: payload.data[dataKey].map(mapRecord),
      serverKnowledge: payload.data.server_knowledge ?? serverKnowledge ?? 0,
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
    const payload = await getJson(response, YnabCategoriesDeltaEnvelopeSchema);
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
        YnabAccountRecordSchema,
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
        YnabPlanMonthRecordSchema,
        toYnabMonth,
      );
    },
    listPayeesDelta(planId, serverKnowledge) {
      return getMappedDelta<"payees", YnabPayeeRecord, YnabPayee>(
        planId,
        "payees",
        "payees",
        serverKnowledge,
        YnabPayeeRecordSchema,
        toYnabPayee,
      );
    },
    listPayeeLocationsDelta(planId, serverKnowledge) {
      return getOptionalCursorMappedDelta<
        "payee_locations",
        YnabPayeeLocationRecord,
        YnabPayeeLocation
      >(
        planId,
        "payee_locations",
        "payee_locations",
        serverKnowledge,
        YnabPayeeLocationRecordSchema,
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
        YnabScheduledTransactionRecordSchema,
        toYnabScheduledTransaction,
      );
    },
    listTransactionsDelta(planId, serverKnowledge) {
      return getDelta<"transactions", YnabDeltaTransactionRecord>(
        planId,
        "transactions",
        "transactions",
        serverKnowledge,
        YnabTransactionRecordSchema,
      );
    },
  };
}
