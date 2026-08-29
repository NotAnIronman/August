# Cache sound-effect synthesis

This directory owns the RuneScape cache format that encodes sound effects as
instruments, envelopes, oscillators, and filters. `SoundEffect` decodes that
format and synthesizes PCM samples; it is not an obsolete implementation of the
Vorbis music/audio path under `audio/vorbis`.

The former age-based audio subpaths were removed after all repository consumers
migrated. New code must import `@august/osrs-engine/audio/cache-synthesis` or a
file beneath that domain; there is deliberately no parallel compatibility
implementation.
