import type { OAuthStore } from "../oauth/core/store.js";
import { z } from "zod";

type FetchLike = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

export type AtomicOAuthKvNamespace = KVNamespace & {
  consume<T = unknown>(
    key: string,
    options?: { type?: string },
  ): Promise<T | null>;
};

const StringArraySchema = z.array(z.string());

const OAuthRegisteredClientSchema = z
  .object({
    clientId: z.string(),
    clientIdIssuedAt: z.number(),
    clientName: z.string().optional(),
    grantTypes: StringArraySchema,
    redirectUris: StringArraySchema,
    responseTypes: StringArraySchema,
    scopes: StringArraySchema,
    tokenEndpointAuthMethod: z.literal("none"),
  })
  .transform((record) => {
    if (record.clientName === undefined) {
      const { clientName: _clientName, ...requiredRecord } = record;

      return requiredRecord;
    }

    return record;
  });

const OAuthAuthorizationCodeSchema = z
  .object({
    clientId: z.string(),
    code: z.string(),
    codeChallenge: z.string(),
    expiresAt: z.number(),
    redirectUri: z.string(),
    resource: z.string(),
    scopes: StringArraySchema,
    used: z.boolean(),
  })
  .strict();

const OAuthAccessTokenSchema = z
  .object({
    audience: z.string(),
    clientId: z.string(),
    expiresAt: z.number(),
    issuedAt: z.number(),
    issuer: z.string(),
    jti: z.string(),
    scopes: StringArraySchema,
    token: z.string(),
  })
  .strict();

const OAuthRefreshTokenSchema = z
  .object({
    clientId: z.string(),
    expiresAt: z.number(),
    familyId: z.string(),
    resource: z.string(),
    scopes: StringArraySchema,
    token: z.string(),
    used: z.boolean(),
  })
  .strict();

const OAuthRefreshTokenRotationResultSchema = z.discriminatedUnion("status", [
  z.object({
    record: OAuthRefreshTokenSchema,
    status: z.literal("rotated"),
  }),
  z
    .object({
      record: OAuthRefreshTokenSchema.optional(),
      status: z.union([z.literal("not_found"), z.literal("replay_detected")]),
    })
    .transform((result) => {
      if (result.record === undefined) {
        const { record: _record, ...emptyResult } = result;

        return emptyResult;
      }

      return result;
    }),
]);

const KvListResultSchema = z
  .object({
    cursor: z.string().optional(),
    keys: z.array(
      z
        .object({
          expiration: z.number().optional(),
          metadata: z.unknown().optional(),
          name: z.string(),
        })
        .passthrough(),
    ),
    list_complete: z.boolean(),
  })
  .passthrough();

function expectOk(response: Response) {
  if (response.ok) {
    return response;
  }

  if (response.status === 404) {
    return response;
  }

  throw new Error(`OAuth state request failed with status ${response.status}.`);
}

function parseOAuthStateJson<TSchema extends z.ZodType>(
  payload: unknown,
  schema: TSchema,
): z.output<TSchema> {
  const result = schema.safeParse(payload);

  if (!result.success) {
    throw new Error("OAuth state response body is invalid.");
  }

  return result.data;
}

async function readJsonResponse<TSchema extends z.ZodType>(
  response: Response,
  schema: TSchema,
) {
  const payload: unknown = await response.json();

  return parseOAuthStateJson(payload, schema);
}

async function postJson(fetcher: FetchLike, path: string, payload: unknown) {
  return expectOk(
    await fetcher.fetch(`https://oauth-state${path}`, {
      body: JSON.stringify(payload),
      method: "POST",
    }),
  );
}

async function getJson<TSchema extends z.ZodType>(
  fetcher: FetchLike,
  path: string,
  schema: TSchema,
): Promise<z.output<TSchema> | undefined> {
  const response = expectOk(await fetcher.fetch(`https://oauth-state${path}`));

  if (response.status === 404) {
    return undefined;
  }

  return readJsonResponse(response, schema);
}

function parseJson(value: string): unknown {
  return JSON.parse(value);
}

export function createDurableObjectOAuthStore(fetcher: FetchLike): OAuthStore {
  return {
    getAccessToken(token) {
      return getJson(
        fetcher,
        `/access-tokens/${encodeURIComponent(token)}`,
        OAuthAccessTokenSchema,
      );
    },
    getAuthorizationCode(code) {
      return getJson(
        fetcher,
        `/authorization-codes/${encodeURIComponent(code)}`,
        OAuthAuthorizationCodeSchema,
      );
    },
    getRegisteredClient(clientId) {
      return getJson(
        fetcher,
        `/clients/${encodeURIComponent(clientId)}`,
        OAuthRegisteredClientSchema,
      );
    },
    async issueAccessToken(record) {
      await postJson(fetcher, "/access-tokens", record);
    },
    async issueAuthorizationCode(record) {
      await postJson(fetcher, "/authorization-codes", record);
    },
    async issueRefreshToken(record) {
      await postJson(fetcher, "/refresh-tokens", record);
    },
    async registerClient(record) {
      await postJson(fetcher, "/clients", record);
    },
    async rotateRefreshToken(token) {
      const response = await postJson(fetcher, "/refresh-tokens/rotate", {
        token,
      });

      return readJsonResponse(response, OAuthRefreshTokenRotationResultSchema);
    },
    async useAuthorizationCode(code) {
      const response = await postJson(fetcher, "/authorization-codes/use", {
        code,
      });

      if (response.status === 404) {
        return undefined;
      }

      return readJsonResponse(response, OAuthAuthorizationCodeSchema);
    },
  };
}

export function createDurableObjectOAuthKvNamespace(
  fetcher: FetchLike,
): KVNamespace {
  return {
    async consume(key: string, options?: { type?: string }) {
      const response = expectOk(
        await fetcher.fetch("https://oauth-state/kv/consume", {
          body: JSON.stringify({ key }),
          method: "POST",
        }),
      );

      if (response.status === 404) {
        return null;
      }

      const value = await response.text();

      if (options?.type === "json") {
        return parseJson(value);
      }

      return value;
    },
    async get(key: string, options?: { type?: string }) {
      const response = expectOk(
        await fetcher.fetch(
          `https://oauth-state/kv/${encodeURIComponent(key)}`,
        ),
      );

      if (response.status === 404) {
        return null;
      }

      const value = await response.text();

      if (options?.type === "json") {
        return parseJson(value);
      }

      return value;
    },
    async put(
      key: string,
      value: string,
      options?: { expirationTtl?: number },
    ) {
      const requestInit: RequestInit = {
        body: value,
        method: "PUT",
      };

      if (options?.expirationTtl) {
        requestInit.headers = {
          "x-expiration-ttl": String(options.expirationTtl),
        };
      }

      expectOk(
        await fetcher.fetch(
          `https://oauth-state/kv/${encodeURIComponent(key)}`,
          requestInit,
        ),
      );
    },
    async delete(key: string) {
      expectOk(
        await fetcher.fetch(
          `https://oauth-state/kv/${encodeURIComponent(key)}`,
          {
            method: "DELETE",
          },
        ),
      );
    },
    async list(options?: { prefix?: string }) {
      const params = new URLSearchParams();

      if (options?.prefix) {
        params.set("prefix", options.prefix);
      }

      const query = params.toString();
      const response = expectOk(
        await fetcher.fetch(
          `https://oauth-state/kv${query ? `?${query}` : ""}`,
        ),
      );

      return readJsonResponse(response, KvListResultSchema);
    },
  } as unknown as AtomicOAuthKvNamespace;
}
