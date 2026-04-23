type StorageLike = {
  get<T>(key: string): Promise<T | undefined>;
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

function jsonResponse(payload: unknown, status = 200) {
  return Response.json(payload, { status });
}

function readJson(request: Request) {
  return request.json() as Promise<Record<string, unknown>>;
}

async function runStorageCriticalSection<T>(storage: StorageLike, action: () => Promise<T>) {
  const previous = storageLocks.get(storage) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });

  storageLocks.set(storage, previous.then(() => next));

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
    async get(key) {
      return values.get(key) as never;
    },
    async put(key, value) {
      values.set(key, value);
    }
  };
}

export async function handleOAuthStateRequest(storage: StorageLike, request: Request) {
  const url = new URL(request.url);

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

  if (request.method === "GET" && url.pathname.startsWith("/authorization-codes/")) {
    const code = decodeURIComponent(url.pathname.slice("/authorization-codes/".length));
    const record = await storage.get(authorizationCodeKey(code));

    return record ? jsonResponse(record) : new Response(null, { status: 404 });
  }

  if (request.method === "POST" && url.pathname === "/authorization-codes/use") {
    return runStorageCriticalSection(storage, async () => {
      const body = await readJson(request);
      const code = String(body.code);
      const record = await storage.get<Record<string, unknown> & { used?: boolean }>(
        authorizationCodeKey(code)
      );

      if (!record || record.used) {
        return new Response(null, { status: 404 });
      }

      await storage.put(authorizationCodeKey(code), {
        ...record,
        used: true
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
    const token = decodeURIComponent(url.pathname.slice("/access-tokens/".length));
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
      const record = await storage.get<Record<string, unknown> & { familyId?: string; used?: boolean }>(refreshTokenKey(token));

      if (!record) {
        return jsonResponse({
          status: "not_found"
        });
      }

      if (record.familyId) {
        const familyRevoked = await storage.get<boolean>(refreshTokenFamilyKey(record.familyId));

        if (familyRevoked) {
          return jsonResponse({
            record,
            status: "replay_detected"
          });
        }
      }

      if (record.used) {
        if (record.familyId) {
          await storage.put(refreshTokenFamilyKey(record.familyId), true);
        }

        return jsonResponse({
          record,
          status: "replay_detected"
        });
      }

      await storage.put(refreshTokenKey(token), {
        ...record,
        used: true
      });

      return jsonResponse({
        record,
        status: "rotated"
      });
    });
  }

  return new Response(null, { status: 404 });
}
