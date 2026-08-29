# `@august/protocol`

Serializable client/server contracts, packet identifiers, wire payloads, and UI protocol
contracts. This package may depend on `@august/game-model`; it may not import engine,
custom-content, or application code.

The two client-to-server binary streams are intentionally distinct. See
[`src/transport/README.md`](src/transport/README.md) for their registries, codec owners, and
wire-stability rules.

Binary buffer ownership and byte-size formatting live under `src/binary`; XXHash
implementations live under `src/hashing`. The former `utils/*` entrypoints were
removed after every repository consumer migrated to these domain exports; no
utility catch-all or compatibility surface remains.
