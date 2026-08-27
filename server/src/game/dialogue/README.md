# August dialogue architecture

August has two authoring surfaces which now share the same concepts:

- TypeScript content uses `sayNpc`, `sayPlayer`, `choose`, `pooled`, and `run`.
- Persisted Dialogue Editor content uses `line`, `options`, `pool`, and `action` nodes.

Use a `pool` when talking to an NPC should select one complete conversation.
Each entry may have a relative weight; persisted entries may also carry a
declarative condition. Keep stateful outcomes as actions, not prose.

## Stateful actions

Persisted JSON never contains executable code. An `invoke` action contains a
stable key and JSON-safe arguments:

```json
{
  "kind": "action",
  "action": {
    "type": "invoke",
    "key": "slayer.assignTask",
    "args": { "master": "duradel" }
  }
}
```

The owning content system registers that key through
`services.dialogueActions.register(...)`. A handler may return `"stop"` when
it replaces the chatbox with another interface. General vanilla actions are
registered in `gamemodes/vanilla/npcs/dialogueActions.ts`.

## Importing OSRS Wiki transcripts

Generate one review draft:

```text
yarn --cwd server import-wiki-dialogue --page Man --section "Standard dialogue"
```

Generate a throttled batch:

```text
yarn --cwd server import-wiki-dialogue --all --limit 100
```

`--all` walks the Wiki's `NPC dialogue` category rather than guessing NPCs
from page names.

Drafts are written to `server/data/dialogue-imports`. They retain the source
URL, revision ID, retrieval time, sections, speakers, and unresolved hooks.
Random groups and ordinary response options are converted automatically.
Natural-language conditions and effects are deliberately marked
`needs-review`; map them to August conditions/actions before promoting the
section's `tree` into runtime content.

Set `AUGUST_WIKI_USER_AGENT` to a project-specific contact string before a
large import. The batch importer defaults to a 500 ms delay between requests.
