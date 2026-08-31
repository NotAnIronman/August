# Instance system

`InstancedAreaManager` owns the complete lifetime of a private world view. A runtime tracks its
members, NPCs, temporary locations, ground items, collision map, and instance-owned scheduled tasks.
The runtime is destroyed only after its final member leaves.

Existing quest calls remain solo by default. A party encounter can be created and joined through
the script facade:

```ts
const room = services.instances.create(player, {
    definitionId: "graardor-room",
    access: "party",
    maxPlayers: 5,
    joinInProgress: false,
    templateChunks,
    destination: { x: 2864, y: 5354, level: 2 },
    exit: { x: 2851, y: 5333, level: 2 },
    npcs,
});

services.instances.join(member, room.id);
services.instances.markStarted(room.id);
services.instances.leave(member);
```

The Join Party interface can populate itself with `services.instances.listJoinable("graardor-room")`
and pass the selected runtime id to `join`.

An entry object should map its Open, Enter Solo, Enter Party, and Join Party options to these calls.
The object script owns party/invite authorization and presentation; the instance manager remains the
authoritative capacity, world-view isolation, membership, and cleanup boundary.

Solo instances close on death, logout, teleport, or an explicit leave because the member count reaches
zero. In a party instance the owner may leave; ownership transfers to a remaining member and the room
continues. Death and disconnect already converge on `dispose`/`leave`, so they follow the same rule.

NPCs in party instances are scoped to the shared world view rather than one player. Combat, movement,
locations, and ground items already use that world-view identity, preventing players in another copy
of the same map coordinates from seeing or interacting with the encounter.
