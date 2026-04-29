export type OAuthRegisteredClient = {
  clientId: string;
  clientIdIssuedAt: number;
  clientName?: string;
  grantTypes: string[];
  redirectUris: string[];
  responseTypes: string[];
  scopes: string[];
  tokenEndpointAuthMethod: "none";
};

export type OAuthAuthorizationCode = {
  clientId: string;
  code: string;
  codeChallenge: string;
  expiresAt: number;
  resource: string;
  redirectUri: string;
  scopes: string[];
  used: boolean;
};

export type OAuthAccessToken = {
  audience: string;
  clientId: string;
  expiresAt: number;
  issuedAt: number;
  issuer: string;
  jti: string;
  scopes: string[];
  token: string;
};

export type OAuthRefreshToken = {
  clientId: string;
  expiresAt: number;
  familyId: string;
  resource: string;
  scopes: string[];
  token: string;
  used: boolean;
};

export type OAuthRefreshTokenRotationResult =
  | {
      record: OAuthRefreshToken;
      status: "rotated";
    }
  | {
      record?: OAuthRefreshToken;
      status: "not_found" | "replay_detected";
    };

export type OAuthStore = {
  getAccessToken(token: string): Promise<OAuthAccessToken | undefined>;
  getAuthorizationCode(
    code: string,
  ): Promise<OAuthAuthorizationCode | undefined>;
  getRegisteredClient(
    clientId: string,
  ): Promise<OAuthRegisteredClient | undefined>;
  issueAccessToken(record: OAuthAccessToken): Promise<void>;
  issueAuthorizationCode(record: OAuthAuthorizationCode): Promise<void>;
  issueRefreshToken(record: OAuthRefreshToken): Promise<void>;
  registerClient(record: OAuthRegisteredClient): Promise<void>;
  rotateRefreshToken(token: string): Promise<OAuthRefreshTokenRotationResult>;
  useAuthorizationCode(
    code: string,
  ): Promise<OAuthAuthorizationCode | undefined>;
};

export function createInMemoryOAuthStore(): OAuthStore {
  const registeredClients = new Map<string, OAuthRegisteredClient>();
  const authorizationCodes = new Map<string, OAuthAuthorizationCode>();
  const accessTokens = new Map<string, OAuthAccessToken>();
  const refreshTokens = new Map<string, OAuthRefreshToken>();
  const revokedRefreshTokenFamilies = new Set<string>();

  return {
    getAccessToken(token) {
      return Promise.resolve(accessTokens.get(token));
    },
    getAuthorizationCode(code) {
      return Promise.resolve(authorizationCodes.get(code));
    },
    getRegisteredClient(clientId) {
      return Promise.resolve(registeredClients.get(clientId));
    },
    issueAccessToken(record) {
      accessTokens.set(record.token, record);

      return Promise.resolve();
    },
    issueAuthorizationCode(record) {
      authorizationCodes.set(record.code, record);

      return Promise.resolve();
    },
    issueRefreshToken(record) {
      refreshTokens.set(record.token, record);

      return Promise.resolve();
    },
    registerClient(record) {
      registeredClients.set(record.clientId, record);

      return Promise.resolve();
    },
    rotateRefreshToken(token) {
      const record = refreshTokens.get(token);

      if (!record) {
        return Promise.resolve({
          status: "not_found",
        } satisfies OAuthRefreshTokenRotationResult);
      }

      if (revokedRefreshTokenFamilies.has(record.familyId)) {
        return Promise.resolve({
          record,
          status: "replay_detected",
        } satisfies OAuthRefreshTokenRotationResult);
      }

      if (record.used) {
        revokedRefreshTokenFamilies.add(record.familyId);

        return Promise.resolve({
          record,
          status: "replay_detected",
        } satisfies OAuthRefreshTokenRotationResult);
      }

      const nextRecord = {
        ...record,
        used: true,
      };

      refreshTokens.set(token, nextRecord);

      return Promise.resolve({
        record,
        status: "rotated",
      } satisfies OAuthRefreshTokenRotationResult);
    },
    useAuthorizationCode(code) {
      const record = authorizationCodes.get(code);

      if (!record || record.used) {
        return Promise.resolve(undefined);
      }

      authorizationCodes.set(code, {
        ...record,
        used: true,
      });

      return Promise.resolve(record);
    },
  };
}
