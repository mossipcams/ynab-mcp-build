# Test Plan

## Completed

- Vitest split into `unit` and `workers`
- Architecture boundary enforcement tests
- OAuth core tests for:
  - resource indicator enforcement
  - JWT access token issuance and verification basics
  - refresh token family replay revocation
  - token id generation
- OAuth HTTP tests for:
  - configuration error invariant
  - metadata cache headers
  - resource parameter enforcement
  - `/authorize` validation cases
  - `/token` validation cases
- MCP bearer-auth tests for:
  - missing auth
  - bad signature
  - wrong audience
  - `alg=none`
- YNAB platform tests for:
  - mapper and property invariants
  - current-schema fixture canaries
  - transport error categorization

## Remaining

### Test Authoring Rule

- Every new test must include a `// DEFECT:` comment naming the single defect class it catches.
- If a test cannot name a concrete defect class, delete it instead of checking in documentation-by-test.
- If a test is catching multiple defect classes, split it before implementation.

### Durable Objects

- Auth code atomic storage
- One-shot redemption under concurrency
- Expiry behavior
- Refresh rotation atomicity under parallel calls
- Replay prevention storage behavior
- Alarm draining after each test

### OAuth Store Routing Invariant

- Prove DO-backed mode routes through DO storage
- Prove injected test store is used when provided

### OAuth HTTP Remaining Coverage

- `/register` malformed redirect URI matrix
- Localhost HTTP exception coverage
- Metadata response validation against RFC-focused schemas
- Happy-path `/authorize` direct-handler assertion for the 302 DO bug

### MCP Layer

- Every slice tool is registered
- `tools/list` completeness
- Valid `inputSchema` exposure
- Typed result formatting
- Typed error formatting
- Unknown tool `-32602`
- Bad args `-32602`
- JSON-RPC id echo behavior
- Insufficient-scope `403`

### Streamable HTTP Transport

- GET stream establishment
- POST streaming response behavior
- Whole JSON-RPC chunk boundaries
- Malformed frame handling
- Disconnect cleanup
- Auth rejection before stream establishment

### Slice Tests

- Per-slice `service` contract tests
- Tool-definition validity tests
- Typed error shape tests
- Property tests for split aggregation where applicable

### Cross-Cutting Security Invariants

- Secrets never appear in response bodies
- Secrets never appear in logs
- OAuth errors never leak stack traces or file paths
- MCP tool responses never leak auth material

### Integration Happy Paths

- Discovery flow
- Register -> authorize -> token flow
- Authenticated `/mcp` tool call flow

### Broader Schema-at-Boundary Work

- Explicit `src/oauth/core/schemas.ts`
- Explicit `src/mcp/schemas.ts`
- Wider runtime parsing through those schemas, not just YNAB fixtures

## Partially Done

- YNAB schema tracking is in place for the active platform tests, but not yet expanded into one fixture per endpoint consumed by the client.
- OAuth misconfiguration testing exists for the failure case, but not yet the proofs that DO mode and injected-store mode are actually used.
