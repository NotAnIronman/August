# Server pathfinding

`PathService.ts` is the single application-facing route and reachability boundary.
Callers request routes or reach checks there; they do not instantiate a second
pathfinder.

`engine/` contains the collision strategies, route strategies, flags, and breadth-first
grid algorithm used by that service. The engine is active production code, not a
deprecated fallback. `DirectReach.ts` contains the focused direct-reach predicate used
by the same boundary.

Collision-map ownership remains under `world/`; pathfinding reads it through the
service interfaces. Changes to route semantics require focused interaction/movement
tests plus the real-pathfinding regression suite.
