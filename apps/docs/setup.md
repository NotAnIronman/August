# Setup guide

August is a pnpm workspace. Run repository commands from the root unless a command below
explicitly targets one workspace.

## Prerequisites

| Tool | Version | Purpose |
| --- | --- | --- |
| Node.js | 22.16.0 or newer | Runtime and build tools |
| pnpm | 11.19.0 | Workspace package manager |
| Git | Current | Source control |

The repository pins Node in **.node-version** and **.nvmrc**, and pnpm in the root
**packageManager** field. Corepack is the simplest way to activate the pinned pnpm:

```bash
corepack enable
corepack prepare pnpm@11.19.0 --activate
```

## 1. Clone

```bash
git clone https://github.com/NotAnIronman/August.git
cd August
```

## 2. Install and prepare data

```bash
pnpm run setup
pnpm run prepare:data
```

The first command installs the complete workspace from **pnpm-lock.yaml**. The second
ensures the configured OSRS cache is available and builds collision data. Cache downloads,
locks, collision output, logs, and databases are local runtime state under
**apps/server/var/** and are ignored.

Do not copy another developer's runtime state into the repository. If a data migration is
required, follow [Environment and data migrations](contributing/environment-and-migrations.md).

## 3. Configure local environment

Copy the safe placeholders you need from the root **.env.example** into a local
**.env**. Never commit, print, or share that file. Browser-only CRA values can be placed
in **apps/client/.env.local**.

The bundled configuration in **apps/server/config.json** defines:

- World 1: Vanilla;
- World 2: Leagues V.

Game-mode IDs are persistence keys. Do not rename them to change a display label.

## 4. Start August

Both configured server worlds and the browser client:

```bash
pnpm run start
```

World 1 and the browser client:

```bash
pnpm run start:vanilla
```

Server worlds only:

```bash
pnpm run server
```

Browser client only:

```bash
pnpm run client
```

Routine server logs stay at **info** without tracing each walk, attack, item, or
widget packet. Set **LOG_LEVEL=debug** temporarily when diagnosing those paths;
**LOG_INCLUDE** and **LOG_EXCLUDE** can narrow output to comma-separated categories.
Set **REACT_APP_CLIENT_DEBUG=true** in **apps/client/.env.local** before starting or
building the browser when verbose client diagnostics are needed.

Run one configured world:

```bash
pnpm --filter @august/server start:world -- --world=1
pnpm --filter @august/server start:world -- --world=2
```

The client opens at `http://localhost:3000` by default. Server addresses are shown on
the login screen from the client configuration.

## Account registration

New-account registration is enabled unless **ALLOW_ACCOUNT_REGISTRATION=false**.
Privileged usernames are empty by default and must be configured explicitly.

Production startup fails when a gamemode or content module cannot register, preventing a
partially functional world from accepting players. Development logs all broken providers
and continues so one module can be repaired at a time. Set **SCRIPT_STRICT_STARTUP**
explicitly only when you need to override that environment-sensitive default.

Legacy account-file claiming is disabled by default. Enable it only for a controlled
migration:

```powershell
$env:ALLOW_LEGACY_ACCOUNT_CLAIM = "true"
pnpm run start
```

## Player persistence

Connected players are autosaved every two minutes by default. Large worlds save in
bounded batches so serialization and SQLite work do not monopolize a game tick. Override
the cadence with **PLAYER_AUTOSAVE_TICKS** and the batch size with
**PLAYER_AUTOSAVE_BATCH_SIZE**; the root **.env.example** documents their defaults and
limits. Setting **PLAYER_AUTOSAVE_TICKS=0** disables periodic saves, but an orderly server
shutdown still drains pending work and performs one final complete save before closing
the database.

## Troubleshooting

### Cache preparation fails

- Confirm the target revision in **apps/server/target.txt**.
- Remove only the incomplete local cache beneath **apps/server/var/**, not source data.
- Re-run **pnpm --filter @august/server ensure-cache**.
- Corporate TLS interception may require the system CA configuration documented by your
  environment.

### Collision generation is slow

The first model-aware collision build can take several minutes. Later builds reuse local
runtime output. Do not commit that output.

### Port 43594 is already in use

Stop the other process or change the affected world port in
**apps/server/config.json**. Every simultaneously running world needs a unique port.

### Client is blank or cannot connect

- Check the browser console and server terminal.
- Confirm the selected WebSocket host/port matches **apps/server/config.json**.
- Confirm browser values in **apps/client/.env.local** use the **REACT_APP_** prefix.
- Run **pnpm --filter @august/client typecheck**.

### Node or pnpm version errors

```bash
node --version
pnpm --version
```

Use Node 22.16.0+ and pnpm 11.19.0. Delete no lockfile to bypass an engine or dependency
failure.

## Useful commands

| Command | Purpose |
| --- | --- |
| **pnpm run setup** | Install the frozen workspace dependency graph |
| **pnpm run prepare:data** | Ensure cache inputs and build collision data |
| **pnpm run start** | Start both configured worlds and the client |
| **pnpm run start:vanilla** | Start World 1 and the client |
| **pnpm run check** | Run repository contracts, typechecks, safe tests, and all production builds |
| **pnpm run typecheck:all** | Include broader maintenance/test typing |
| **pnpm run test:all** | Run all app suites |
| **pnpm run test:cache** | Run cache-dependent suites |
| **pnpm --filter @august/docs build** | Build this documentation site |
