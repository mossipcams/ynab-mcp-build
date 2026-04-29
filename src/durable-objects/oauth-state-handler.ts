type StorageLike = {
  delete?(key: string): Promise<boolean | void>;
  get<T>(key: string): Promise<T | undefined>;
  list?<T>(options?: { prefix?: string }): Promise<Map<string, T>>;
  put<T>(key: string, value: T): Promise<void>;
};

const storageLocks = new WeakMap<StorageLike, Promise<void>>();

function clientKey(clientId: string) {
  return `client:${clientId}`;
}

function authorizationCodeKey(code: string) {
  return `authorization-code:${code}`;
}

function accessTokenKey(token: string) {
  return `access-token:${token}`;
}

function refreshTokenKey(token: string) {
  return `refresh-token:${token}`;
}

function refreshTokenFamilyKey(familyId: string) {
  return `refresh-token-family:${familyId}`;
}

function kvRecordKey(key: string) {
  return `kv:${key}`;
}

function jsonResponse(payload: unknown, status = 200) {
  return Response.json(payload, { status });
}

function readJson(request: Request) {
  return request.json() as Promise<Record<string, unknown>>;
}

async function runStorageCriticalSection<T>(
  storage: StorageLike,
  action: () => Promise<T>,
) {
  const previous = storageLocks.get(storage) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });

  storageLocks.set(
    storage,
    previous.then(() => next),
  );

  await previous;

  try {
    return await action();
  } finally {
    release();

    if (storageLocks.get(storage) === next) {
      storageLocks.delete(storage);
    }
  }
}

export function createMemoryOAuthStateStorage(): StorageLike {
  const values = new Map<string, unknown>();

  return {
    delete(key) {
      values.delete(key);

      return Promise.resolve();
    },
    get(key) {
      return Promise.resolve(values.get(key) as never);
    },
    list(options) {
      const records = new Map(
        [...values.entries()].filter(([key]) =>
          options?.prefix ? key.startsWith(options.prefix) : true,
        ),
      ) as never;

      return Promise.resolve(records);
    },
    put(key, value) {
      values.set(key, value);

      return Promise.resolve();
    },
  };
}

type KvRecord = {
  expiresAt?: number;
  value: string;
};

function isExpired(record: KvRecord, now = Date.now()) {
  return record.expiresAt !== undefined && record.expiresAt <= now;
}

async function getKvRecord(storage: StorageLike, key: string) {
  const storageKey = kvRecordKey(key);
  const record = await storage.get<KvRecord>(storageKey);

  if (!record) {
    return undefined;
  }

  if (isExpired(record)) {
    await storage.delete?.(storageKey);

    return undefined;
  }

  return record;
}

export async function handleOAuthStateRequest(
  storage: StorageLike,
  request: Request,
) {
  try {
    return await handleOAuthStateRequestUnsafe(storage, request);
  } catch (error) {
    return jsonResponse(
      {
        error: "oauth_state_store_unavailable",
        error_description:
          error instanceof Error
            ? error.message
            : "OAuth state store unavailable.",
      },
      500,
    );
  }
}

async function handleOAuthStateRequestUnsafe(
  storage: StorageLike,
  request: Request,
) {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/kv") {
    const prefix = url.searchParams.get("prefix") ?? "";
    const records = await storage.list?.<KvRecord>({
      prefix: kvRecordKey(prefix),
    });
    const keys = [];

    for (const [key, record] of records ?? new Map<string, KvRecord>()) {
      if (!isExpired(record)) {
        keys.push({
          name: key.slice("kv:".length),
        });
      } else {
        await storage.delete?.(key);
      }
    }

    return jsonResponse({
      keys,
      list_complete: true,
    });
  }

  if (request.method === "POST" && url.pathname === "/kv/consume") {
    return runStorageCriticalSection(storage, async () => {
      const body = await readJson(request);
      const key = String(body.key);
      const storageKey = kvRecordKey(key);
      const record = await getKvRecord(storage, key);

      if (!record) {
        return new Response(null, { status: 404 });
      }

      await storage.delete?.(storageKey);

      return new Response(record.value);
    });
  }

  if (url.pathname.startsWith("/kv/")) {
    const key = decodeURIComponent(url.pathname.slice("/kv/".length));

    if (request.method === "GET") {
      const record = await getKvRecord(storage, key);

      return record
        ? new Response(record.value)
        : new Response(null, { status: 404 });
    }

    if (request.method === "PUT") {
      const expirationTtl = request.headers.get("x-expiration-ttl");
      const ttlSeconds = expirationTtl ? Number(expirationTtl) : undefined;
      const value = await request.text();

      await storage.put(kvRecordKey(key), {
        ...(ttlSeconds && Number.isFinite(ttlSeconds)
          ? { expiresAt: Date.now() + ttlSeconds * 1000 }
          : {}),
        value,
      });

      return new Response(null, { status: 204 });
    }

    if (request.method === "DELETE") {
      await storage.delete?.(kvRecordKey(key));

      return new Response(null, { status: 204 });
    }
  }

  if (request.method === "POST" && url.pathname === "/clients") {
    const body = await readJson(request);

    await storage.put(clientKey(String(body.clientId)), body);

    return new Response(null, { status: 204 });
  }

  if (request.method === "GET" && url.pathname.startsWith("/clients/")) {
    const clientId = decodeURIComponent(url.pathname.slice("/clients/".length));
    const client = await storage.get(clientKey(clientId));

    return client ? jsonResponse(client) : new Response(null, { status: 404 });
  }

  if (request.method === "POST" && url.pathname === "/authorization-codes") {
    const body = await readJson(request);

    await storage.put(authorizationCodeKey(String(body.code)), body);

    return new Response(null, { status: 204 });
  }

  if (
    request.method === "GET" &&
    url.pathname.startsWith("/authorization-codes/")
  ) {
    const code = decodeURIComponent(
      url.pathname.slice("/authorization-codes/".length),
    );
    const record = await storage.get(authorizationCodeKey(code));

    return record ? jsonResponse(record) : new Response(null, { status: 404 });
  }

  if (
    request.method === "POST" &&
    url.pathname === "/authorization-codes/use"
  ) {
    return runStorageCriticalSection(storage, async () => {
      const body = await readJson(request);
      const code = String(body.code);
      const record = await storage.get<
        Record<string, unknown> & { used?: boolean }
      >(authorizationCodeKey(code));

      if (!record || record.used) {
        return new Response(null, { status: 404 });
      }

      await storage.put(authorizationCodeKey(code), {
        ...record,
        used: true,
      });

      return jsonResponse(record);
    });
  }

  if (request.method === "POST" && url.pathname === "/access-tokens") {
    const body = await readJson(request);

    await storage.put(accessTokenKey(String(body.token)), body);

    return new Response(null, { status: 204 });
  }

  if (request.method === "GET" && url.pathname.startsWith("/access-tokens/")) {
    const token = decodeURIComponent(
      url.pathname.slice("/access-tokens/".length),
    );
    const record = await storage.get(accessTokenKey(token));

    return record ? jsonResponse(record) : new Response(null, { status: 404 });
  }

  if (request.method === "POST" && url.pathname === "/refresh-tokens") {
    const body = await readJson(request);

    await storage.put(refreshTokenKey(String(body.token)), body);

    return new Response(null, { status: 204 });
  }

  if (request.method === "POST" && url.pathname === "/refresh-tokens/rotate") {
    return runStorageCriticalSection(storage, async () => {
      const body = await readJson(request);
      const token = String(body.token);
      const record = await storage.get<
        Record<string, unknown> & { familyId?: string; used?: boolean }
      >(refreshTokenKey(token));

      if (!record) {
        return jsonResponse({
          status: "not_found",
        });
      }

      if (record.familyId) {
        const familyRevoked = await storage.get<boolean>(
          refreshTokenFamilyKey(record.familyId),
        );

        if (familyRevoked) {
          return jsonResponse({
            record,
            status: "replay_detected",
          });
        }
      }

      if (record.used) {
        if (record.familyId) {
          await storage.put(refreshTokenFamilyKey(record.familyId), true);
        }

        return jsonResponse({
          record,
          status: "replay_detected",
        });
      }

      await storage.put(refreshTokenKey(token), {
        ...record,
        used: true,
      });

      return jsonResponse({
        record,
        status: "rotated",
      });
    });
  }

  return new Response(null, { status: 404 });
}
