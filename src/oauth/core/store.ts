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
  getAuthorizationCode(code: string): Promise<OAuthAuthorizationCode | undefined>;
  getRegisteredClient(clientId: string): Promise<OAuthRegisteredClient | undefined>;
  issueAccessToken(record: OAuthAccessToken): Promise<void>;
  issueAuthorizationCode(record: OAuthAuthorizationCode): Promise<void>;
  issueRefreshToken(record: OAuthRefreshToken): Promise<void>;
  registerClient(record: OAuthRegisteredClient): Promise<void>;
  rotateRefreshToken(token: string): Promise<OAuthRefreshTokenRotationResult>;
  useAuthorizationCode(code: string): Promise<OAuthAuthorizationCode | undefined>;
};

export function createInMemoryOAuthStore(): OAuthStore {
  const registeredClients = new Map<string, OAuthRegisteredClient>();
  const authorizationCodes = new Map<string, OAuthAuthorizationCode>();
  const accessTokens = new Map<string, OAuthAccessToken>();
  const refreshTokens = new Map<string, OAuthRefreshToken>();
  const revokedRefreshTokenFamilies = new Set<string>();

  return {
    async getAccessToken(token) {
      return accessTokens.get(token);
    },
    async getAuthorizationCode(code) {
      return authorizationCodes.get(code);
    },
    async getRegisteredClient(clientId) {
      return registeredClients.get(clientId);
    },
    async issueAccessToken(record) {
      accessTokens.set(record.token, record);
    },
    async issueAuthorizationCode(record) {
      authorizationCodes.set(record.code, record);
    },
    async issueRefreshToken(record) {
      refreshTokens.set(record.token, record);
    },
    async registerClient(record) {
      registeredClients.set(record.clientId, record);
    },
    async rotateRefreshToken(token) {
      const record = refreshTokens.get(token);

      if (!record) {
        return {
          status: "not_found"
        };
      }

      if (revokedRefreshTokenFamilies.has(record.familyId)) {
        return {
          record,
          status: "replay_detected"
        };
      }

      if (record.used) {
        revokedRefreshTokenFamilies.add(record.familyId);

        return {
          record,
          status: "replay_detected"
        };
      }

      const nextRecord = {
        ...record,
        used: true
      };

      refreshTokens.set(token, nextRecord);

      return {
        record,
        status: "rotated"
      };
    },
    async useAuthorizationCode(code) {
      const record = authorizationCodes.get(code);

      if (!record || record.used) {
        return undefined;
      }

      authorizationCodes.set(code, {
        ...record,
        used: true
      });

      return record;
    }
  };
}
