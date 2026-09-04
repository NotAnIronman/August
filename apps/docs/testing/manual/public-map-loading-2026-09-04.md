# Hosted map-loading regression

- Owner: browser cache/map workers and server client hosting.
- Date/tester: 2026-09-04, Codex.
- Build: local fixes on top of `c1508b47`; optimized production client
  `main.a06b8009.js`, confirmed loaded after browser reload.
- Cache: OSRS revision 237, `osrs-237_2026-03-25`.
- Mode: unauthenticated browser startup against a loopback-only asset server using the
  real `serveHostedClient` handler; no game world or player account created.

## Findings and verification

**Pass — automated:** Webpack bundles the real browser gzip module and WASM asset. The
initializer receives a URL string, accelerated decompression works, returned bytes survive
WASM memory reuse, and a failed fetch falls back to JavaScript. Rejected, synchronous,
and stalled optional accelerators do not block initialization. Corrupt gzip data still
fails rather than being silently accepted.

**Pass — automated:** Rejected terrain loads release their loading slots without marking
the map permanently invalid. Retries use exponential backoff, recover when the worker
recovers, and ignore stale failures after scene reset. Failed reload batches settle.
Suppressed requests release their slots; invalid terrain also uses retry backoff.

**Pass — automated:** The hosted-client handler returns `application/wasm` for WASM assets.

**Pass — browser startup:** Open the rebuilt production client through the asset-only
server, allow the real cache to initialize, and inspect the console. Expected: reach
`LOGIN_SCREEN` without the previously reproduced `WebAssembly.instantiate(): Argument 0
must be a buffer source` error. Observed: cache initialization completed and the login
screen was reached; no WASM errors or fallback warnings. Browser persistent-storage
permission was denied, which is unrelated to world initialization.

**Blocked — live external gameplay:** The public host has not been updated/restarted by
this task, and no authenticated public-player test was performed. After deploying the
updated code and rebuilt client, reload from an external PC and phone, log in, and verify
terrain, movement, and trading. A successful login-screen smoke test is not proof that
the multiplayer world renders end to end.

## Coverage and revalidation

Regression coverage lives in `browser-gzip.test.ts`, `map-load-failure.test.ts`, and
`client-hosting-boundary.test.ts`. Revalidate after bundler, WASM dependency, cache-loading,
or static-hosting changes. Replace the blocked external-gameplay entry with its actual
result after deployment; retain the automated regressions while these features exist.
