import { describe, expect, it } from "vitest";

import { validateClientRegistrationMetadata } from "./client-registration-policy.js";

function baseMetadata(redirectUri: string) {
  return {
    grant_types: ["authorization_code", "refresh_token"],
    redirect_uris: [redirectUri],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };
}

describe("OAuth client registration policy", () => {
  it("accepts trusted Claude callback metadata", () => {
    expect(
      validateClientRegistrationMetadata(
        baseMetadata("https://claude.ai/api/mcp/auth_callback"),
      ),
    ).toEqual({
      accepted: true,
      metadata: baseMetadata("https://claude.ai/api/mcp/auth_callback"),
    });
  });

  it("accepts trusted ChatGPT callback metadata", () => {
    expect(
      validateClientRegistrationMetadata(
        baseMetadata("https://chatgpt.com/aip/g-abc123/oauth/callback"),
      ),
    ).toEqual({
      accepted: true,
      metadata: baseMetadata("https://chatgpt.com/aip/g-abc123/oauth/callback"),
    });
    expect(
      validateClientRegistrationMetadata(
        baseMetadata("https://chat.openai.com/aip/g-abc123/oauth/callback"),
      ),
    ).toEqual({
      accepted: true,
      metadata: baseMetadata(
        "https://chat.openai.com/aip/g-abc123/oauth/callback",
      ),
    });
  });

  it("accepts loopback callback metadata", () => {
    for (const redirectUri of [
      "http://localhost:3000/callback",
      "http://127.0.0.1:3000/callback",
      "http://[::1]:3000/callback",
    ]) {
      expect(
        validateClientRegistrationMetadata(baseMetadata(redirectUri)),
      ).toEqual({
        accepted: true,
        metadata: baseMetadata(redirectUri),
      });
    }
  });

  it("rejects arbitrary HTTPS redirect URIs", () => {
    expect(
      validateClientRegistrationMetadata(
        baseMetadata("https://evil.example.com/callback"),
      ),
    ).toEqual({
      accepted: false,
      error: "invalid_client_metadata",
      errorDescription: "redirect_uris contains an untrusted redirect URI.",
    });
  });

  it("rejects multiple redirect URIs", () => {
    expect(
      validateClientRegistrationMetadata({
        ...baseMetadata("https://claude.ai/api/mcp/auth_callback"),
        redirect_uris: [
          "https://claude.ai/api/mcp/auth_callback",
          "http://localhost:3000/callback",
        ],
      }),
    ).toEqual({
      accepted: false,
      error: "invalid_client_metadata",
      errorDescription: "redirect_uris must contain exactly one redirect URI.",
    });
  });

  it("rejects bad redirect URI schemes", () => {
    for (const redirectUri of [
      "http://example.com/callback",
      "ftp://localhost/callback",
      "javascript:alert(1)",
    ]) {
      expect(
        validateClientRegistrationMetadata(baseMetadata(redirectUri)),
      ).toEqual({
        accepted: false,
        error: "invalid_client_metadata",
        errorDescription: "redirect_uris contains an untrusted redirect URI.",
      });
    }
  });

  it("rejects unsupported response types, grant types, and auth methods", () => {
    expect(
      validateClientRegistrationMetadata({
        ...baseMetadata("https://claude.ai/api/mcp/auth_callback"),
        response_types: ["token"],
      }),
    ).toEqual({
      accepted: false,
      error: "invalid_client_metadata",
      errorDescription: "response_types must be exactly code.",
    });
    expect(
      validateClientRegistrationMetadata({
        ...baseMetadata("https://claude.ai/api/mcp/auth_callback"),
        grant_types: ["client_credentials"],
      }),
    ).toEqual({
      accepted: false,
      error: "invalid_client_metadata",
      errorDescription:
        "grant_types must include authorization_code and may include refresh_token only.",
    });
    expect(
      validateClientRegistrationMetadata({
        ...baseMetadata("https://claude.ai/api/mcp/auth_callback"),
        token_endpoint_auth_method: "client_secret_basic",
      }),
    ).toEqual({
      accepted: false,
      error: "invalid_client_metadata",
      errorDescription: "token_endpoint_auth_method must be none.",
    });
  });
});
