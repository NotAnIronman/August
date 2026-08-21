# XRSPS

A community-driven project inspired by Project Zanaris.
OSRS in the browser with a React/WebGL client and TypeScript WebSocket server.

## Packages

This repository contains:

- [`client/`](client/) — `@xrsps/client` (browser app)
- [`server/`](server/) — `@xrsps/server` (game server)
- [`docs/`](docs/) — documentation site

## Quick Start

Requires **Node.js v22.16+** and **Yarn**.

Install Yarn if it is not already installed:

```bash
npm install --global yarn
```

Install the server and client, then build collision data:

```bash
yarn setup
```

Start the server and client together:

```bash
yarn start
```

Start only the server:

```bash
yarn server
```

Start only the client:

```bash
yarn client
```

Start the documentation site (optional):

```bash
cd docs
yarn install
yarn dev
```

See [docs/setup.md](docs/setup.md) for details.

For private IPv6 hosting, see [docs/hosting.md](docs/hosting.md).

---

Fan project. Not affiliated with, endorsed by, or connected to Jagex Ltd.
Old School RuneScape and related assets/trademarks belong to their respective owners.
