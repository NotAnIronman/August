# Skilling framework

August's reusable skilling boundary lives in `apps/server/src/game/skilling`. It owns the mechanics that should behave the same for every skill: requirements, action timing and interruption, atomic inventory exchanges, production batches, gathering rolls, depletion, respawn, and tracker ownership. Content modules still own world-specific movement, interfaces, messages, sounds, and unusual state machines.

## Authoring shorthand

### Gather

```ts
const mining = defineGatheringSkill<Rock, Pickaxe, { canDeplete: boolean }>({
    name: "mine",
    timing: { delayTicks: 1 },
    success: {
        kind: "linear-255",
        low: (rock) => rock.mineChance,
        ratio: (rock) => rock.mineRatio,
    },
    depletion: {
        chance: (rock, state) => (state.canDeplete ? rock.depleteChance : 0),
    },
    respawn: { duration: (rock) => rock.respawnTicks },
});

// Tool-specific timings are cached and still share skill.mine interruption.
mining.request(services, player, actionData, tick, {
    delayTicks: pickaxe.swingTicks,
    cooldownTicks: pickaxe.swingTicks,
});
mining.repeat(services, player, nextData, tick, {
    delayTicks: pickaxe.swingTicks,
    cooldownTicks: pickaxe.swingTicks,
});
```

`linear-255` preserves the established low/high interpolation formula. `custom` accepts an injected random function for exact skill-specific formulae. Depletion chances and respawn ranges are callbacks, so gem rocks, league tools, multi-resource rocks, and other exceptions do not require another engine.

### Produce

```ts
const crafting = defineProductionSkill({
    name: "craft",
    skillId: SkillId.Crafting,
    recipes: [{
        id: "example",
        source: sourceDefinition,
        level: 50,
        levelSource: "effective", // or "base"
        tools: [{ itemIds: [HAMMER, IMCANDO_HAMMER], source: "carried" }],
        inputs: [{ itemId: MATERIAL, quantity: 2 }],
        outputs: [{ itemId: PRODUCT, quantity: 1 }],
        xp: 75,
        animationId: 898,
        ticks: 3,
        outputPlacement: "first-consumed-slot",
    }],
    messages,
});

registry.registerActionHandler(crafting.actionKind, crafting.execute);
crafting.request(services, player, crafting.getRecipe("example")!, amount, tick);
```

`resolveOutcome` supports success/failure products, variable quantities, conditional input/output, XP, and animation. `afterStep` supports committed non-inventory state such as charge consumption. `buildRepeatData` carries facilities or heat sources through a batch. A scoped `random` callback makes stochastic production deterministic in tests. Cooking burn outcomes and iron smelting therefore remain one production engine, not parallel implementations.

### Transform

```ts
const result = applyInventoryTransform(services.inventory, player, {
    // `slot` is optional; use it when item-on-item semantics must consume the
    // exact clicked vial, herb, or secondary rather than another matching item.
    inputs: [{ itemId: raw, quantity: 1, slot: clickedSlot }],
    outputs: [{ itemId: cooked, quantity: 1 }],
    outputPlacement: "first-consumed-slot",
});
```

The transform validates every amount before mutation, combines duplicate inputs, snapshots all slots, and rolls back the complete 28-slot inventory if a later output or facade operation fails. Non-stackable quantities greater than one always go through the inventory insertion API instead of creating an invalid stack in the consumed slot.

### Requirements and actions

```ts
checkSkillingRequirements(services, player, {
    levels: [{ skillId: SkillId.Smithing, level: 90, source: "effective" }],
    tools: [{ itemIds: [HAMMER, IMCANDO_HAMMER], source: "carried", match: "any" }],
});

const action = defineSkillAction("custom", { delayTicks: 3 });
requestSkillAction(services, player, action, data, tick);
repeatSkillAction(services, player, action, nextData, tick);
```

Every action receives a `skill.*` group. Movement, combat, another skill, logout, and other registered interruption sources can therefore stop work consistently.

### Node lifecycle

```ts
const tracker = new ResourceNodeTracker<NodeData>();
const dispose = services.gathering!.registerTracker("resource", tracker, restoreNode, {
    // Optional: cleanup may restore geometry without awarding natural-expiry loot.
    onDispose: restoreNodeWithoutRewards,
});
registry.registerCleanup(dispose);
```

Replacing a named tracker with a different tracker, or disposing its current registration, drains it. Each drained node receives one best-effort restoration callback; callback failures are logged and are not retried, while the remaining nodes continue. Re-registering the same tracker instance does not drain it. Disposers are ownership-checked, so stale cleanup cannot erase a newer hot-reloaded provider. Skill-contributed lookup callbacks follow the same rule: capture the old provider and restore it only while the installed callback is still current.

## Vanilla migration matrix

| Domain | Shared coverage | Intentional bespoke behavior |
| --- | --- | --- |
| Agility | No shared skilling action is scheduled for the current obstacle; the interaction executes immediately | obstacle routing, movement locks, damage, and course state |
| Consumables | Shared interruption contract applies | dose transitions, combat cooldowns, delayed healing, boosts, poison and venom |
| Crafting | Declarative gem, jewellery, leather, silver, and glass production; atomic spinning and sinew transforms; owned flax node lifecycle | spinning-wheel loc visuals/sounds, sheep positioning and shearing state |
| Firemaking | Owned fire node lifecycle and provider cleanup | fire placement/collision, forced step-away, campfire continuation and ashes |
| Fishing | Declarative success formula and cached per-tool timing; shared request/repeat; atomic bait-to-catch exchange and minnow exchange | moving NPC spots, echo-harpoon bank/cook perk |
| Fletching | All registered recipes use declarative requirements, atomic transforms, animation, XP, events, timing, and batching | product selection UI and recipe-specific messages |
| Herblore | Cleaning, unfinished/finished potions and stamina batches use pinned atomic transforms | recipe/stage selection, dose/container identity and messaging |
| Mining | Declarative exact success/depletion/respawn policies, weighted resource selection, cached per-pickaxe action timing, owned tracker/provider lifecycle | echo-pickaxe bank routing and four-success depletion gate |
| Prayer | Player-scoped lifecycle cleanup covers burial/scattering cooldowns and pending rewards; no `skill.*` action is scheduled | bone/altar multipliers, immediate altar actions, and prayer restoration surfaces |
| Production | Cooking and tanning use the production engine; cooking burn products and tanning base-level requirements are explicit policies; bolt enchanting uses shared action timing and atomic rune/bolt exchange | bolt spell selection and graphic semantics |
| Runecrafting | Air rune batches use an atomic whole-inventory essence exchange | altar access, essence choice, pouch state and multi-rune scaling |
| Sailing | Shared action scheduler remains underneath | vehicle/world-entity simulation, boarding, collision and route state |
| Smithing | Anvil recipes and furnace recipes use production policies and atomic exchanges; stochastic iron and ring charges use outcome hooks | forge/smelting interfaces and facility restrictions |
| Thieving | Shared effective-level checks, pickpocket/picklock action phases, evidence-based success curves, bundled atomic rewards and pouch conversion | NPC identity/lifecycle, repeated detection, target consequences, chest depletion and door traversal; see [Thieving framework](thieving-framework.md) |
| Woodcutting | Declarative exact success/depletion/respawn policies, cached shared action loop, owned tracker/provider lifecycle | guild invisible boost and echo-axe bank routing |

## Embedded skilling outside `skills/`

| Content | Status |
| --- | --- |
| Godsword shard smithing | Ported to `applyInventoryTransform`; existing hammer check, three-tick lock, animation, recipe priority and messages remain local. |
| Nex Bandos breakdown, Torva repair, Zaryte crossbow | Ported to `applyInventoryTransform`; component counts, level/tool checks, locks and animations remain local. |
| Frozen Door key assembly and consumption | Ported to `applyInventoryTransform`; quest registration/completion, failure restoration and teleports remain local. |
| Moons of Peril fishing and bream cooking | Deferred: instance-owned repeat scheduling, add-or-drop rewards and encounter teardown must first be characterized together. The gathering and production policies can express the formula/timing. |
| Moons grub paste, potion mixing and moth restore | Deferred: the current module directly couples item conversion to encounter supplies, stat restoration and add-or-drop behavior. Deterministic item portions are migration candidates after encounter regression coverage. |

## Valid exceptions and next ports

A bespoke handler is valid when success commits world or actor state that cannot be rolled back with inventory alone. Examples are agility traversal, campfire placement, sailing entities, thieving retaliation, runecrafting pouches, spell/rune consumption, and encounter-owned gathering. These handlers should still use the smallest applicable primitives (`defineSkillAction`, requirements, or atomic transform) rather than cloning the whole production/gathering loop.

When adding a skill action:

1. Put static level/tool/input/output/XP/timing data in a definition.
2. Inject exact chance, depletion, respawn, and outcome formulae instead of generalizing them away.
3. Use an atomic transform for every inventory exchange.
4. Request and repeat through a `skill.*` action policy.
5. Register depleted-node or provider cleanup with the script registry.
6. Test failure ordering, full-inventory rollback, repeat data, interruption, and hot-reload disposal.
