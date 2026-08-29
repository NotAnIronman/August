# Testing policy

Tests belong to the behavior owner. A refactor is complete only when the same observable
behavior passes from the new ownership boundary.

## Required validation

The required command for a normal pull request is:

```powershell
pnpm run check
```

It enforces layout, naming, and dependency rules; type-checks runtime and test surfaces;
runs the cache-independent suites; and builds every application. Record the command and
result in the pull request.

Run additional validation when the change requires it:

| Change | Additional evidence |
| --- | --- |
| Cache-dependent behavior | **pnpm run test:cache** and the cache revision used |
| Persistence or schema | Dry run, fixture migration, verification query, and rollback test |
| Loader/path move | Startup or focused integration test from the repository root |
| Visual, animation, timing, or multiplayer behavior | Structured manual record plus automated coverage for every machine-checkable rule |
| Tool or generator | Fixture-based tool test and deterministic output diff |

If a command cannot run, state why and what narrower evidence ran. “Not tested” without
an explanation is not a handoff.

## Test placement and names

- App tests belong in `apps/<app>/tests/`.
- Package tests belong in `packages/<package>/tests/`.
- Reusable runners, harness infrastructure, and cross-application fixtures belong in
  **tools/testing/**; feature assertions do not.
- App suites currently live under **apps/client/tests/** and **apps/server/tests/** while
  feature-level tests move alongside their owning source boundaries.
- Name a test after behavior, **behavior.test.ts**. Name fixtures
  **scenario.fixture.json**.
- A bug fix needs a regression that fails for the defect and passes for the fix.
- A move needs a boundary test when dynamic loading, working-directory assumptions, or
  string paths could bypass static type checks.

Tests must control time, random values, network responses, and mutable state. Default
suites must not require production credentials, a developer's account database, or a
live external service. Use minimal synthetic fixtures; never copy **apps/server/var** or
its compatibility state into the repository.

## Manual validation

Manual validation is appropriate for observations that cannot yet be asserted reliably,
but it does not replace an automated test for deterministic rules. Store durable records
under **apps/docs/testing/manual/** with:

- status and feature owner;
- test date, build/commit, cache revision, world/mode, and tester;
- setup, steps, expected result, and observed result;
- evidence or linked issue;
- automated coverage added or still missing;
- revalidation trigger and removal condition.

Use **pass**, **fail**, **blocked**, or **needs automation** rather than an unexplained
check mark. Working notes created before this policy may keep their original vocabulary
when the header explains it.

## Test lifecycle

- Keep a regression as long as the supported behavior exists.
- Update a fixture only after reviewing why its semantics changed.
- Remove a test with the feature or contract it protects, never merely because it fails
  during a refactor.
- Promote resolved manual findings into automated coverage and remove the stale manual
  entry.
- Delete one-off harnesses after adoption; reusable infrastructure must have an owner,
  consumers, and tests of its own.
