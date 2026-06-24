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

export type OAuthRefreshTokenRotationInput = {
  clientId: string;
  now: number;
  resource: string;
  token: string;
};

export type OAuthRefreshTokenRotationResult =
  | {
      record: OAuthRefreshToken;
      status: "rotated";
    }
  | {
      record?: OAuthRefreshToken;
      status:
        | "expired"
        | "invalid_client"
        | "invalid_resource"
        | "not_found"
        | "replay_detected";
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
  rotateRefreshToken(
    input: OAuthRefreshTokenRotationInput | string,
  ): Promise<OAuthRefreshTokenRotationResult>;
  useAuthorizationCode(
    code: string,
  ): Promise<OAuthAuthorizationCode | undefined>;
};
