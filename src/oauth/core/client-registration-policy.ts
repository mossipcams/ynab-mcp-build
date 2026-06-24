import { z } from "zod";

type AcceptedClientRegistration = {
  accepted: true;
  metadata: ClientRegistrationMetadata;
};

type RejectedClientRegistration = {
  accepted: false;
  error: "invalid_client_metadata";
  errorDescription: string;
};

type ClientRegistrationPolicyResult =
  | AcceptedClientRegistration
  | RejectedClientRegistration;

export type ClientRegistrationMetadata = {
  client_name?: string;
  grant_types: string[];
  redirect_uris: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
};

const ClientRegistrationMetadataSchema = z
  .object({
    client_name: z.string().min(1).optional(),
    grant_types: z.array(z.string()),
    redirect_uris: z.array(z.string()),
    response_types: z.array(z.string()),
    token_endpoint_auth_method: z.string(),
  })
  .passthrough();

function reject(errorDescription: string): RejectedClientRegistration {
  return {
    accepted: false,
    error: "invalid_client_metadata",
    errorDescription,
  };
}

function hasOnlySupportedGrantTypes(grantTypes: string[]) {
  return (
    grantTypes.includes("authorization_code") &&
    grantTypes.every(
      (grantType) =>
        grantType === "authorization_code" || grantType === "refresh_token",
    )
  );
}

function isExactlyCodeResponseType(responseTypes: string[]) {
  return responseTypes.length === 1 && responseTypes[0] === "code";
}

function isLoopbackHost(hostname: string) {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
  );
}

function isTrustedClaudeRedirect(url: URL) {
  return (
    url.protocol === "https:" &&
    url.hostname === "claude.ai" &&
    url.pathname === "/api/mcp/auth_callback"
  );
}

function isTrustedChatGptRedirect(url: URL) {
  return (
    url.protocol === "https:" &&
    (url.hostname === "chatgpt.com" || url.hostname === "chat.openai.com") &&
    /^\/aip\/[^/]+\/oauth\/callback$/u.test(url.pathname)
  );
}

function isLoopbackRedirect(url: URL) {
  return url.protocol === "http:" && isLoopbackHost(url.hostname);
}

function isTrustedRedirectUri(redirectUri: string) {
  try {
    const url = new URL(redirectUri);

    return (
      isTrustedClaudeRedirect(url) ||
      isTrustedChatGptRedirect(url) ||
      isLoopbackRedirect(url)
    );
  } catch {
    return false;
  }
}

export function validateClientRegistrationMetadata(
  input: unknown,
): ClientRegistrationPolicyResult {
  const metadata = ClientRegistrationMetadataSchema.safeParse(input);

  if (!metadata.success) {
    return reject("client metadata is invalid.");
  }

  if (metadata.data.redirect_uris.length !== 1) {
    return reject("redirect_uris must contain exactly one redirect URI.");
  }

  if (!isTrustedRedirectUri(metadata.data.redirect_uris[0]!)) {
    return reject("redirect_uris contains an untrusted redirect URI.");
  }

  if (!isExactlyCodeResponseType(metadata.data.response_types)) {
    return reject("response_types must be exactly code.");
  }

  if (!hasOnlySupportedGrantTypes(metadata.data.grant_types)) {
    return reject(
      "grant_types must include authorization_code and may include refresh_token only.",
    );
  }

  if (metadata.data.token_endpoint_auth_method !== "none") {
    return reject("token_endpoint_auth_method must be none.");
  }

  return {
    accepted: true,
    metadata: {
      ...(metadata.data.client_name
        ? { client_name: metadata.data.client_name }
        : {}),
      grant_types: metadata.data.grant_types,
      redirect_uris: metadata.data.redirect_uris,
      response_types: metadata.data.response_types,
      token_endpoint_auth_method: metadata.data.token_endpoint_auth_method,
    },
  };
}
