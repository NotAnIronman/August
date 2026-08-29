# Environment and data migrations

Configuration belongs in a documented contract; secrets and mutable state do not belong
in Git.

## Environment variables

- **.env** and every local **.env.*** variant are ignored. Never stage, print, log, or
  attach their values.
- **.env.example** is the committed contract. It contains safe placeholders only and
  documents whether each variable is required, its format/units, and its development
  default.
- A change that adds, renames, or removes a variable updates the example, typed
  configuration validation, deployment configuration, and setup documentation together.
- New project-owned keys use the **AUGUST_** prefix and **UPPER_SNAKE_CASE**.
- Read environment variables through the owning application's configuration boundary;
  do not scatter direct lookups or fallback behavior throughout gameplay code.
- Production secrets come from the deployment environment or secret manager. Never use
  a developer's local file as a deployment source.

If a secret is committed, removing the file is not remediation: rotate the credential,
purge it according to repository policy, and audit its use.

## Mutable runtime data

The home for accounts, player state, world databases, downloaded cache, logs,
locks, and temporary files is **apps/server/var/**. It is ignored and must be backed up
outside the source tree.

Legacy app-local state paths remain ignored only as a safety net for existing developer
checkouts; new code and deployment automation must not read or write them. Migrate any
such state into **apps/server/var/** with a backup and validation rather than deleting it
as source cleanup. Game-mode IDs such as **vanilla** and **leagues-v** are persistence
keys and may change only through an explicit, verified migration.

## Migration ownership

Maintained migrations live under **tools/migrations/** and use
**yyyymmddhhmm-scope-action.ts**. Each migration declares:

- owner, reason, affected modes/worlds, and source/target schema versions;
- prerequisites and compatible application versions;
- exact dry-run and apply commands;
- backup location and restore procedure;
- idempotency or checkpoint/resume behavior;
- validation invariants and a rollback or forward-recovery plan;
- expected duration, disk requirements, and downtime/locking needs.

Application startup may detect an incompatible schema and stop with instructions; it
must not perform an undocumented destructive migration automatically.

## Execution checklist

1. Stop writers or acquire the documented lock.
2. Confirm the target path and schema version.
3. Create and verify a restorable backup outside the repository.
4. Run the migration against a representative copy with **--dry-run**.
5. Review counts, rejected records, storage growth, and invariant checks.
6. Apply once with an explicit target; never use a broad filesystem glob.
7. Start the compatible application and run smoke/regression tests.
8. Record versions, timestamps, counts, and validation—never record secret values or
   player-private data.
9. Retain the prior version until the rollback window closes.

A source refactor and a persistent-data migration are separate risks. They may share a
pull request only when the compatibility window, deployment order, and rollback path are
clear.
