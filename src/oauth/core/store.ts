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
  redirectUri: string;
  scopes: string[];
  used: boolean;
};

export type OAuthAccessToken = {
  clientId: string;
  expiresAt: number;
  scopes: string[];
  token: string;
};

export type OAuthRefreshToken = {
  clientId: string;
  expiresAt: number;
  scopes: string[];
  token: string;
  used: boolean;
};

export type OAuthStore = {
  getAccessToken(token: string): Promise<OAuthAccessToken | undefined>;
  getRegisteredClient(clientId: string): Promise<OAuthRegisteredClient | undefined>;
  issueAccessToken(record: OAuthAccessToken): Promise<void>;
  issueAuthorizationCode(record: OAuthAuthorizationCode): Promise<void>;
  issueRefreshToken(record: OAuthRefreshToken): Promise<void>;
  registerClient(record: OAuthRegisteredClient): Promise<void>;
  rotateRefreshToken(token: string): Promise<OAuthRefreshToken | undefined>;
  useAuthorizationCode(code: string): Promise<OAuthAuthorizationCode | undefined>;
};

export function createInMemoryOAuthStore(): OAuthStore {
  const registeredClients = new Map<string, OAuthRegisteredClient>();
  const authorizationCodes = new Map<string, OAuthAuthorizationCode>();
  const accessTokens = new Map<string, OAuthAccessToken>();
  const refreshTokens = new Map<string, OAuthRefreshToken>();

  return {
    async getAccessToken(token) {
      return accessTokens.get(token);
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
      return refreshTokens.get(token);
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
