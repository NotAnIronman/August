# Experiments and temporary work

Experiments are allowed; anonymous leftovers are not. Choose the location from the
expected lifetime.

| Work | Location | Source-control policy |
| --- | --- | --- |
| Throwaway output, logs, downloads, screenshots | `.tmp/experiments/<slug>/` | Ignored; delete freely |
| Reproducible diagnostic spike worth sharing | `tools/diagnostics/experiments/<slug>/` | Commit temporarily with the record below |
| Durable automated harness | **tools/testing/** | Commit only after adoption and ownership review |
| Human-only validation result | **apps/docs/testing/manual/** | Commit while unresolved; promote and remove |
| Production behavior | Owning app or package | Must not remain under experiments |

Do not create scratch files at the repository root or hide production dependencies in
an experiment directory.

## Experiment record

A committed experiment needs a README containing:

- **Status:** active, adopted, blocked, or retired;
- **Owner:** a person or accountable team;
- **Created** and **review-by** dates;
- hypothesis or question;
- exact run command, inputs, and expected output;
- safety limits and whether network, cache, or mutable state is touched;
- success/failure criteria;
- adoption destination or deletion condition;
- linked issue or pull request.

Set a review-by date no later than the next planned release unless the pull request
explains why. CI or repository maintenance should flag expired active experiments.

## Exit rules

- **Adopted:** move maintained code, tests, and data to their final owners; keep only
  reusable infrastructure and delete raw output.
- **Rejected:** record the conclusion in the linked issue or decision document, then
  delete the experiment.
- **Blocked:** state the external condition and next review date; do not let “blocked”
  become permanent storage.
- **Abandoned or expired:** delete it. Git history is the archive.

Feature flags, compatibility adapters, and duplicate implementations are not experiments
unless they carry the same owner and removal condition. A passing experiment is not
production-ready until normal type checks, tests, data rules, and review all pass.
