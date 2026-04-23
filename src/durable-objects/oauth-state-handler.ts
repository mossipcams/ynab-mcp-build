type StorageLike = {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
};

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

function jsonResponse(payload: unknown, status = 200) {
  return Response.json(payload, { status });
}

function readJson(request: Request) {
  return request.json() as Promise<Record<string, unknown>>;
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

  if (request.method === "POST" && url.pathname === "/authorization-codes/use") {
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
    const body = await readJson(request);
    const token = String(body.token);
    const record = await storage.get<Record<string, unknown>>(refreshTokenKey(token));

    if (!record) {
      return new Response(null, { status: 404 });
    }

    return jsonResponse(record);
  }

  return new Response(null, { status: 404 });
}
