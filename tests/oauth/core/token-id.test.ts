import { describe, expect, it } from "vitest";

import { generateOAuthTokenId } from "../../../src/oauth/core/token-id.js";

describe("oauth token id generation", () => {
  it("generates URL-safe identifiers with at least 128 bits of entropy", () => {
    // DEFECT: authorization and refresh identifiers can be guessable or malformed enough to weaken brute-force resistance.
    const tokenId = generateOAuthTokenId();

    expect(tokenId).toMatch(/^[A-Za-z0-9_-]{43}$/u);
  });

  it("does not collide across 10000 generated identifiers", () => {
    // DEFECT: token id generation can accidentally reuse identifiers and allow unrelated authorization artifacts to alias each other.
    const ids = new Set<string>();

    for (let index = 0; index < 10_000; index += 1) {
      ids.add(generateOAuthTokenId());
    }

    expect(ids.size).toBe(10_000);
  });
});
