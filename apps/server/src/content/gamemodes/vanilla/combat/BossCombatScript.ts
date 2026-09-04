import { attack, defineBoss, phase } from "@server/game/encounters/BossDefinition";
import { registerOwnedEncounter } from "@server/game/encounters/EncounterRegistry";
import type { IScriptRegistry } from "@server/game/scripts/types";

/**
 * Registers the non-instanced vanilla bosses that predate content modules.
 *
 * General Graardor intentionally does not appear here: the Bandos provider is
 * his sole authoritative definition. Empty legacy callbacks (Mole burrowing,
 * Zulrah clouds/adds and form animation comments) are not presented as live
 * mechanics; they can be added as real encounter callbacks when implemented.
 */
export function registerBossCombatEncounters(registry: IScriptRegistry): void {
    registerOwnedEncounter(registry, defineBoss({
        id: "giant-mole",
        npcTypeIds: [5779],
        attacks: [
            attack.melee({
                id: "claw",
                speedTicks: 4,
                maxHit: 21,
                animationId: 3312,
                effects: { minimumHit: 1 },
            }),
            attack.melee({
                id: "stomp",
                speedTicks: 6,
                maxHit: 30,
                animationId: 3313,
                effects: { minimumHit: 5 },
            }),
        ],
    }));

    registerOwnedEncounter(registry, defineBoss({
        id: "dagannoth-rex",
        npcTypeIds: [2265],
        attacks: [attack.melee({
            id: "melee",
            speedTicks: 4,
            maxHit: 26,
            animationId: 2853,
            effects: { minimumHit: 1 },
        })],
    }));

    registerOwnedEncounter(registry, defineBoss({
        id: "dagannoth-prime",
        npcTypeIds: [2266],
        attacks: [attack.magic({
            id: "magic",
            speedTicks: 4,
            maxHit: 50,
            animationId: 2854,
            projectileId: 162,
            effects: { minimumHit: 1 },
        })],
    }));

    registerOwnedEncounter(registry, defineBoss({
        id: "dagannoth-supreme",
        npcTypeIds: [2267],
        attacks: [attack.ranged({
            id: "ranged",
            speedTicks: 4,
            maxHit: 30,
            animationId: 2855,
            projectileId: 294,
            effects: { minimumHit: 1 },
        })],
    }));

    registerOwnedEncounter(registry, defineBoss({
        id: "zulrah",
        npcTypeIds: [2042, 2043, 2044],
        attacks: [
            attack.ranged({
                id: "ranged",
                speedTicks: 4,
                maxHit: 41,
                animationId: 5069,
                projectileId: 1044,
                effects: { minimumHit: 1 },
            }),
            attack.magic({
                id: "magic",
                speedTicks: 4,
                maxHit: 41,
                animationId: 5069,
                projectileId: 1046,
                effects: { minimumHit: 1 },
            }),
            attack.melee({
                id: "melee",
                speedTicks: 3,
                maxHit: 32,
                animationId: 5806,
                effects: { minimumHit: 1 },
            }),
        ],
        phases: [
            phase.atHealth("green", 100, ["ranged"]),
            phase.atHealth("blue", 75, ["magic"]),
            phase.atHealth("red", 50, ["melee"]),
            phase.atHealth("green-final", 25, ["ranged"]),
        ],
    }));
}
