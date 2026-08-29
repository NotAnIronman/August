# Data and generated artifacts

Every dataset needs one classification, one owner, known consumers, and a reproducible
update path. File size is not a reason to delete data, and a JSON extension is not proof
that data belongs in runtime source.

## Target ownership

| Location | Contents | Commit policy |
| --- | --- | --- |
| **data/catalogs/** | Reviewed canonical data maintained by the project | Commit and review semantic changes |
| **data/generated/** | Deterministic derived data consumed by apps or packages | Commit only with generator and validation |
| **data/references/** | External evidence, research inputs, and review reports | Commit selectively with provenance; runtime must not depend on it |
| **data/schemas/** | Machine-readable contracts for maintained datasets | Commit with the data consumer |
| **apps/server/resources/** | Read-only resources owned only by the server deployment | Commit when required to run the server |
| **apps/server/var/** | Accounts, player state, downloaded cache, logs, locks, and temp output | Never commit; back up operationally |

Generated research reports such as
**data/generated/reports/npc-animations/npc-animation-batches.md** are non-runtime
review artifacts. Keep generator inputs and provenance beside their data class; runtime
code must not load the report.

## Required provenance

A committed generated file must record:

- owner and consumers;
- source URL/system, source version or revision, retrieval timestamp, and applicable
  license constraints;
- generator path, exact command, and tool version or commit;
- input versions or checksums when the source can change in place;
- UTC generation timestamp;
- validation command and expected invariants;
- regeneration trigger, retention rule, and removal/replacement condition.

Markdown and text reports put this information in a header. Data formats without
comments use a sibling `<dataset>.meta.json` or the nearest narrowly scoped README.
If no generator is known, classify the artifact as a reference—not generated runtime
data—until provenance is recovered.

## Generator contract

- A generator declares inputs and outputs and resolves paths from the repository root.
- Given the same versioned inputs, output must be byte-for-byte deterministic. Sort
  records and keys deliberately; normalize line endings and timestamps.
- Download and build into an ignored temporary directory, validate the complete result,
  then replace the maintained file atomically.
- Never put credentials, local paths, mutable player state, or unlicensed raw dumps in
  committed output.
- Fail closed on partial downloads, schema violations, duplicate persistent keys, or an
  unexpected empty result.
- Tools write only their documented outputs. A report generator may not silently update
  runtime catalogs.

## Review workflow

1. Run the documented generator from a clean tree with the expected source revision.
2. Validate against the schema and domain invariants.
3. Review the semantic diff, not only file size.
4. Run tests for every consumer.
5. Commit generator changes, schema changes, provenance, and output together.

Do not hand-edit **data/generated/**. Fix the source, override layer, or generator and
regenerate. Hand-maintained exceptions belong in a named catalog or override dataset
with a schema and owner.
