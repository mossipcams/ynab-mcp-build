import type { OAuthAccessToken, OAuthAuthorizationCode, OAuthRefreshToken, OAuthRegisteredClient, OAuthStore } from "../oauth/core/store.js";

type FetchLike = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

async function expectOk(response: Response) {
  if (response.ok) {
    return response;
  }

  if (response.status === 404) {
    return response;
  }

  throw new Error(`OAuth state request failed with status ${response.status}.`);
}

async function postJson(fetcher: FetchLike, path: string, payload: unknown) {
  return expectOk(
    await fetcher.fetch(`https://oauth-state${path}`, {
      body: JSON.stringify(payload),
      method: "POST"
    })
  );
}

async function getJson<T>(fetcher: FetchLike, path: string): Promise<T | undefined> {
  const response = await expectOk(await fetcher.fetch(`https://oauth-state${path}`));

  if (response.status === 404) {
    return undefined;
  }

  return response.json() as Promise<T>;
}

export function createDurableObjectOAuthStore(fetcher: FetchLike): OAuthStore {
  return {
    getAccessToken(token) {
      return getJson<OAuthAccessToken>(fetcher, `/access-tokens/${encodeURIComponent(token)}`);
    },
    getRegisteredClient(clientId) {
      return getJson<OAuthRegisteredClient>(fetcher, `/clients/${encodeURIComponent(clientId)}`);
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
      const response = await postJson(fetcher, "/refresh-tokens/rotate", { token });

      if (response.status === 404) {
        return undefined;
      }

      return response.json() as Promise<OAuthRefreshToken>;
    },
    async useAuthorizationCode(code) {
      const response = await postJson(fetcher, "/authorization-codes/use", { code });

      if (response.status === 404) {
        return undefined;
      }

      return response.json() as Promise<OAuthAuthorizationCode>;
    }
  };
}
