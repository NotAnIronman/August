
import {
    ActorHealthBarsState,
    ActorHitsplatState,
    createActorHealthBarsState,
    HealthBarBarState,
    HealthBarDefinitionState,
    HealthBarUpdateState
} from "@client/engine/game/actor/ActorOverlayState";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function addHitSplatOsrs(host: WebGLOsrsRendererHost, 
        state: ActorHitsplatState,
        type: number,
        value: number,
        type2: number,
        value2: number,
        currentCycle: number,
        delayCycles: number,
    ): void {

        // Mirror Actor.addHitSplat exactly
        let allExpired = true; // var7
        let allActive = true; // var8
        for (let i = 0; i < 4; i++) {
            if ((state.hitSplatCycles[i] | 0) > (currentCycle | 0)) {
                allExpired = false;
            } else {
                allActive = false;
            }
        }

        let slot = -1; // var9
        let compareType = -1;
        let displayCycles = 0;
        if ((type | 0) >= 0) {
            const def = host.hitsplatOverlay?.getDefinition?.(type | 0);
            if (def) {
                compareType = (def.compareType ?? -1) | 0;
                displayCycles = (def.displayCycles ?? 70) | 0;
            } else {
                compareType = -1;
                displayCycles = 70;
            }
        }

        if (allActive) {
            // All 4 slots are active, need to replace one based on compareType
            if ((compareType | 0) === -1) {
                return; // No replacement priority defined, skip this hitsplat
            }
            slot = 0;
            let best = 0;
            // compareType 0 = replace oldest (lowest cycle), 1 = replace lowest damage
            if ((compareType | 0) === 0) best = state.hitSplatCycles[0] | 0;
            else if ((compareType | 0) === 1) best = state.hitSplatValues[0] | 0;
            for (let i = 1; i < 4; i++) {
                if ((compareType | 0) === 0) {
                    const v = state.hitSplatCycles[i] | 0;
                    if (v < best) {
                        slot = i;
                        best = v;
                    }
                } else if ((compareType | 0) === 1) {
                    const v = state.hitSplatValues[i] | 0;
                    if (v < best) {
                        slot = i;
                        best = v;
                    }
                }
            }
            // If compareType=1 and new value is <= existing lowest, don't replace
            if ((compareType | 0) === 1 && (best | 0) >= (value | 0)) {
                return;
            }
        } else {
            // At least one slot is expired, find an empty one
            if (allExpired) {
                state.hitSplatCount = 0;
            }
            for (let i = 0; i < 4; i++) {
                const idx = state.hitSplatCount & 3;
                state.hitSplatCount = (state.hitSplatCount + 1) & 3;
                if ((state.hitSplatCycles[idx] | 0) <= (currentCycle | 0)) {
                    slot = idx;
                    break;
                }
            }
        }

        if (slot >= 0) {
            state.hitSplatTypes[slot] = type | 0;
            state.hitSplatValues[slot] = value | 0;
            state.hitSplatTypes2[slot] = type2 | 0;
            state.hitSplatValues2[slot] = value2 | 0;
            // OSRS: hitSplatCycles[slot] = currentCycle + displayCycles + delayCycles
            // This stores the END cycle (when hitsplat expires)
            // Start visibility = hitSplatCycles - displayCycles (calculated at render time)
            state.hitSplatCycles[slot] = (currentCycle + displayCycles + delayCycles) | 0;
        }
    
}

export function getHitsplatVisibility(host: WebGLOsrsRendererHost, 
        state: ActorHitsplatState,
        slot: number,
        clientCycle: number,
    ): number | undefined {

        const endCycle = state.hitSplatCycles[slot] | 0;
        const type = state.hitSplatTypes[slot] | 0;

        // Type < 0 means unused slot
        if (type < 0) return undefined;

        // Check if expired: hitSplatCycles <= currentCycle
        if (endCycle <= clientCycle) return undefined;

        // Get displayCycles from definition
        const def = host.hitsplatOverlay?.getDefinition?.(type);
        const displayCycles = (def?.displayCycles ?? 70) | 0;

        // Calculate start cycle: endCycle - displayCycles
        const startCycle = endCycle - displayCycles;

        // Check if not yet visible: startCycle > currentCycle
        if (startCycle > clientCycle) return undefined;

        // Calculate animation progress (0 = just started, 1 = about to expire)
        // remainingCycles = endCycle - currentCycle
        // elapsedCycles = displayCycles - remainingCycles = currentCycle - startCycle
        // animProgress = elapsedCycles / displayCycles
        const remainingCycles = endCycle - clientCycle;
        const elapsedCycles = displayCycles - remainingCycles;
        const animProgress = Math.max(0, Math.min(1, elapsedCycles / displayCycles));

        return animProgress;
    
}

export function trimHitsplats(host: WebGLOsrsRendererHost, tick: number): void {

        const playerEcs = host.osrsClient.playerEcs;
        const controlledId = host.getEffectiveControlledPlayerId();
        for (const [playerId, state] of host.playerHitsplats) {
            let active = false;
            for (let i = 0; i < 4; i++) {
                if ((state.hitSplatCycles[i] | 0) > (tick | 0)) {
                    active = true;
                    break;
                }
            }
            const isControlledPlayer = controlledId > 0 && (playerId | 0) === controlledId;
            const missingEcsEntry = playerEcs.getIndexForServerId(playerId) === undefined;
            if (!active || (missingEcsEntry && !isControlledPlayer)) {
                host.playerHitsplats.delete(playerId);
            }
        }
        const npcEcs = host.osrsClient.npcEcs;
        for (const [serverId, state] of host.npcHitsplats) {
            let active = false;
            for (let i = 0; i < 4; i++) {
                if ((state.hitSplatCycles[i] | 0) > (tick | 0)) {
                    active = true;
                    break;
                }
            }
            const ecsId = npcEcs.getEcsIdForServer(serverId);
            if (!active || ecsId === undefined || !npcEcs.isActive(ecsId)) {
                host.npcHitsplats.delete(serverId);
            }
        }
    
}

export function resolveHealthBarDefinition(host: WebGLOsrsRendererHost, defId: number): HealthBarDefinitionState {

        const def = host.healthBarOverlay?.getDefinition?.(defId | 0);
        return {
            defId: defId | 0,
            int1: (def?.int1 ?? 255) | 0,
            int2: (def?.int2 ?? 255) | 0,
            int3: (def?.int3 ?? -1) | 0,
            stepIncrement: (def?.stepIncrement ?? 1) | 0,
            int5: (def?.int5 ?? 70) | 0,
            width: Math.max(1, Math.min(255, def?.width ?? 30)) | 0,
            widthPadding: Math.max(0, def?.widthPadding ?? 0) | 0,
        };
    
}

export function ensureActorHealthBars(host: WebGLOsrsRendererHost, 
        map: Map<number, ActorHealthBarsState>,
        serverId: number,
    ): ActorHealthBarsState {

        let state = map.get(serverId);
        if (state) return state;
        state = createActorHealthBarsState();
        map.set(serverId, state);
        return state;
    
}

export function healthBarPut(host: WebGLOsrsRendererHost, bar: HealthBarBarState, update: HealthBarUpdateState): void {

        const cycle = update.cycle | 0;
        // Update existing entry at the same cycle.
        for (let i = 0; i < bar.updates.length; i++) {
            if ((bar.updates[i].cycle | 0) === cycle) {
                bar.updates[i] = update;
                return;
            }
        }
        // Insert to keep ascending order by cycle (oldest first).
        let insert = bar.updates.length;
        for (let i = 0; i < bar.updates.length; i++) {
            if ((bar.updates[i].cycle | 0) > cycle) {
                insert = i;
                break;
            }
        }
        bar.updates.splice(insert, 0, update);
        // keep at most 4 updates; drop the oldest.
        if (bar.updates.length > 4) bar.updates.shift();
    
}

export function healthBarGet(host: WebGLOsrsRendererHost, 
        bar: HealthBarBarState,
        clientCycle: number,
    ): HealthBarUpdateState | undefined {

        const now = clientCycle | 0;
        if (bar.updates.length === 0) return undefined;
        if ((bar.updates[0].cycle | 0) > now) return undefined;
        // Promote to the newest update with cycle <= now by removing older entries.
        while (bar.updates.length > 1 && (bar.updates[1].cycle | 0) <= now) {
            bar.updates.shift();
        }
        const current = bar.updates[0];
        const def = bar.def;
        // HealthBarDefinition timings are defined in client cycles (20ms).
        if ((def.int5 | 0) + (current.cycleOffset | 0) + (current.cycle | 0) <= now) {
            bar.updates.shift();
            return undefined;
        }
        return current;
    
}

export function actorAddHealthBar(host: WebGLOsrsRendererHost, 
        state: ActorHealthBarsState,
        defId: number,
        update: HealthBarUpdateState,
    ): void {

        const bars = state.bars;
        // Existing bar -> update its timeline.
        for (const b of bars) {
            if ((b.def.defId | 0) === (defId | 0)) {
                host.healthBarPut(b, update);
                return;
            }
        }

        const def = host.resolveHealthBarDefinition(defId);
        const existingCount = bars.length | 0;
        // only add a 5th bar if we can evict an existing bar with int2 > new.int2
        // (Actor.addHealthBar).
        let removable: HealthBarBarState | undefined = undefined;
        let maxInt2 = def.int2 | 0;
        for (const b of bars) {
            const int2 = b.def.int2 | 0;
            if (int2 > maxInt2) {
                maxInt2 = int2;
                removable = b;
            }
        }
        if (existingCount >= 4 && !removable) return;

        const newBar: HealthBarBarState = { def, updates: [] };
        // Keep bars sorted by definition.int1 descending (Actor.addHealthBar).
        let insertIndex = bars.length;
        for (let i = 0; i < bars.length; i++) {
            if ((bars[i].def.int1 | 0) <= (def.int1 | 0)) {
                insertIndex = i;
                break;
            }
        }
        bars.splice(insertIndex, 0, newBar);

        // If we exceeded the cap, remove the bar with the highest int2.
        if (existingCount >= 4 && removable) {
            const idx = bars.indexOf(removable);
            if (idx >= 0) bars.splice(idx, 1);
        }

        host.healthBarPut(newBar, update);
    
}

export function actorRemoveHealthBar(host: WebGLOsrsRendererHost, state: ActorHealthBarsState, defId: number): void {

        const bars = state.bars;
        for (let i = 0; i < bars.length; i++) {
            if ((bars[i].def.defId | 0) === (defId | 0)) {
                bars.splice(i, 1);
                return;
            }
        }
    
}
