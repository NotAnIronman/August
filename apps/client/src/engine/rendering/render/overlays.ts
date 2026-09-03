
import { RS_TO_RADIANS } from "@august/osrs-engine/MathConstants";
import { ModelData } from "@august/osrs-engine/model/ModelData";
import {
    ActorHitsplatState,
    createActorHitsplatState
} from "@client/engine/game/actor/ActorOverlayState";
import {
    HealthBarEntry,
    HitsplatEntry,
    OverheadPrayerEntry,
    OverheadTextEntry
} from "@client/engine/rendering/overlays/Overlay";
import { DEFAULT_OVERHEAD_CHAT_COLOR,DEFAULT_OVERHEAD_CHAT_COLOR_ID } from "@client/engine/rendering/render/constants";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function acquireHitsplatEntry(host: WebGLOsrsRendererHost, ): HitsplatEntry {

        const entry = host.hitsplatPool.pop() ?? { worldX: 0, worldZ: 0, plane: 0 };
        entry.style = undefined;
        entry.spriteName = undefined;
        entry.backgroundTint = undefined;
        entry.type2 = undefined;
        entry.damage2 = undefined;
        return entry;
    
}

export function acquireHealthBarEntry(host: WebGLOsrsRendererHost, ): HealthBarEntry {

        return (
            host.healthBarPool.pop() ?? {
                worldX: 0,
                worldZ: 0,
                plane: 0,
                health: 0,
                health2: 0,
                cycle: 0,
                cycleOffset: 0,
            }
        );
    
}

export function acquireOverheadPrayerEntry(host: WebGLOsrsRendererHost, ): OverheadPrayerEntry {

        return (
            host.overheadPrayerPool.pop() ?? {
                worldX: 0,
                worldZ: 0,
                plane: 0,
                heightOffsetTiles: 0.9,
                headIconPrayer: -1,
            }
        );
    
}

export function acquireOverheadTextEntry(host: WebGLOsrsRendererHost, ): OverheadTextEntry {

        const entry = host.overheadTextPool.pop() ?? {
            worldX: 0,
            worldZ: 0,
            plane: 0,
            heightOffsetTiles: 0.9,
            text: "",
            color: DEFAULT_OVERHEAD_CHAT_COLOR >>> 0,
            colorId: DEFAULT_OVERHEAD_CHAT_COLOR_ID,
            effect: 0,
            life: 1,
            remaining: 0,
            duration: 1,
        };
        entry.modIcon = undefined;
        entry.pattern = undefined;
        return entry;
    
}

export function resetHealthBarOutput(host: WebGLOsrsRendererHost, ): void {

        if (host.healthBarOutput.length === 0) return;
        for (const entry of host.healthBarOutput) {
            entry.defId = undefined;
            entry.heightOffsetTiles = undefined;
            host.healthBarPool.push(entry);
        }
        host.healthBarOutput.length = 0;
    
}

export function resetOverheadPrayerOutput(host: WebGLOsrsRendererHost, ): void {

        if (host.overheadPrayerOutput.length === 0) return;
        for (const entry of host.overheadPrayerOutput) {
            entry.headIconPrayer = -1;
            entry.heightOffsetTiles = 0.9;
            host.overheadPrayerPool.push(entry);
        }
        host.overheadPrayerOutput.length = 0;
    
}

export function resetOverheadTextOutput(host: WebGLOsrsRendererHost, ): void {

        if (host.overheadTextOutput.length === 0) return;
        for (const entry of host.overheadTextOutput) {
            entry.text = "";
            entry.life = 0;
            entry.remaining = 0;
            entry.duration = 0;
            entry.modIcon = undefined;
            entry.pattern = undefined;
            entry.heightOffsetTiles = 0.9;
            entry.color = DEFAULT_OVERHEAD_CHAT_COLOR >>> 0;
            entry.colorId = DEFAULT_OVERHEAD_CHAT_COLOR_ID;
            host.overheadTextPool.push(entry);
        }
        host.overheadTextOutput.length = 0;
    
}

export function resetHitsplatOutput(host: WebGLOsrsRendererHost, ): void {

        if (host.hitsplatOutput.length === 0) return;
        for (const entry of host.hitsplatOutput) {
            entry.style = undefined;
            entry.spriteName = undefined;
            entry.backgroundTint = undefined;
            host.hitsplatPool.push(entry);
        }
        host.hitsplatOutput.length = 0;
    
}

export function getNpcDefaultHeight(host: WebGLOsrsRendererHost, npcTypeId: number): number {

        // Check cache first
        let defaultHeight = host.npcDefaultHeightCache.get(npcTypeId);
        if (defaultHeight !== undefined) {
            return defaultHeight;
        }

        // Default fallback (same as Actor constructor: host.defaultHeight = 200)
        defaultHeight = 200;

        try {
            const npcType = host.osrsClient.npcTypeLoader.load(npcTypeId | 0);
            if (npcType && npcType.modelIds && npcType.modelIds.length > 0) {
                // Load and merge model data
                const models: ModelData[] = [];
                for (const modelId of npcType.modelIds) {
                    const modelData = host.osrsClient.modelLoader.getModel(modelId);
                    if (modelData) {
                        models.push(modelData);
                    }
                }

                if (models.length > 0) {
                    const merged = ModelData.merge(models, models.length);

                    // Apply recoloring (needed for proper model construction)
                    if (npcType.recolorFrom) {
                        for (let i = 0; i < npcType.recolorFrom.length; i++) {
                            merged.recolor(npcType.recolorFrom[i], npcType.recolorTo[i]);
                        }
                    }

                    // Light the model to get a proper Model instance
                    const model = merged.light(
                        host.osrsClient.textureLoader,
                        (npcType.ambient ?? 0) + 64,
                        (npcType.contrast ?? 0) * 5 + 850,
                        -30,
                        -50,
                        -30,
                    );

                    // Apply height scaling (OSRS applies widthScale to X/Z, heightScale to Y)
                    const widthScale = npcType.widthScale ?? 128;
                    const heightScale = npcType.heightScale ?? 128;
                    if (widthScale !== 128 || heightScale !== 128) {
                        model.scale(widthScale, heightScale, widthScale);
                    }

                    // Calculate bounds cylinder to get actual height
                    model.calculateBoundsCylinder();
                    defaultHeight = model.height;
                }
            }
        } catch (e) {
            // Fall back to default on any error
            console.warn(`[renderer] Failed to compute NPC height for ${npcTypeId}:`, e);
        }

        // Cache and return
        host.npcDefaultHeightCache.set(npcTypeId, defaultHeight);
        return defaultHeight;
    
}

export function resolveNpcOverlayAnchor(host: WebGLOsrsRendererHost, 
        ecsId: number,
        baseWorldX: number,
        baseWorldZ: number,
        npcTypeId: number | undefined,
    ): { worldX: number; worldZ: number; logicalHeightTiles: number } {

        let worldX = baseWorldX;
        let worldZ = baseWorldZ;
        let defaultHeight = npcTypeId != null ? host.getNpcDefaultHeight(npcTypeId) : 200;
        let logicalHeightTiles = defaultHeight / 128;

        try {
            if (npcTypeId == null || npcTypeId < 0) {
                return { worldX, worldZ, logicalHeightTiles };
            }
            const npcEcs = host.osrsClient.npcEcs;
            const npcTypeLoader = host.osrsClient.npcTypeLoader;
            const npcModelLoader = host.getInteractNpcModelLoader();
            if (!npcModelLoader || !npcTypeLoader) {
                return { worldX, worldZ, logicalHeightTiles };
            }

            let npcType = npcTypeLoader.load(npcTypeId | 0);
            if (!npcType) {
                return { worldX, worldZ, logicalHeightTiles };
            }
            if (npcType.transforms) {
                const transformed = npcType.transform(host.osrsClient.varManager, npcTypeLoader);
                if (transformed) npcType = transformed;
            }

            const actionSeqId = npcEcs.getSeqId(ecsId) | 0;
            const actionDelay = npcEcs.getSeqDelay?.(ecsId) | 0;
            const { movementSeqId, idleSeqId } = host.resolveNpcMovementSequenceIds(npcEcs, ecsId);
            const actionActive = actionSeqId >= 0 && actionDelay === 0;
            const seqId = actionActive ? actionSeqId : movementSeqId;
            const frame = Math.max(
                0,
                actionActive
                    ? npcEcs.getFrameIndex(ecsId) | 0
                    : npcEcs.getMovementFrameIndex?.(ecsId) | 0,
            );
            const movementFrame = Math.max(0, npcEcs.getMovementFrameIndex?.(ecsId) | 0);
            const overlaySeqId =
                actionActive &&
                host.shouldLayerNpcMovementSequence(
                    actionSeqId | 0,
                    movementSeqId | 0,
                    idleSeqId | 0,
                )
                    ? movementSeqId | 0
                    : -1;
            const overlayFrame = overlaySeqId >= 0 ? movementFrame | 0 : -1;
            const animHeightOffsetTiles = host.getSequenceVerticalOffsetTiles(seqId);

            let model =
                seqId >= 0
                    ? npcModelLoader.getModel(
                        npcType,
                        seqId,
                        frame,
                        overlaySeqId | 0,
                        overlayFrame | 0,
                    )
                    : undefined;
            if (!model) {
                model = npcModelLoader.getModel(npcType, -1, -1);
            }
            if (!model) {
                const baseLogicalHeight =
                    npcType.heightOffset >= 0 ? npcType.heightOffset : defaultHeight;
                return {
                    worldX,
                    worldZ,
                    logicalHeightTiles: baseLogicalHeight / 128 + animHeightOffsetTiles,
                };
            }

            try {
                model.calculateBoundsCylinder();
                defaultHeight = Math.max(1, model.height | 0);
            } catch {}
            const baseLogicalHeight =
                npcType.heightOffset >= 0 ? npcType.heightOffset : defaultHeight;
            logicalHeightTiles = baseLogicalHeight / 128 + animHeightOffsetTiles;

            // Model-space center can be offset from origin; rotate it like npc.vert.glsl.
            try {
                model.calculateBounds();
                const midX = ((model as any).xMid | 0) as number;
                const midZ = ((model as any).zMid | 0) as number;
                const yaw = (npcEcs.getRotation(ecsId) | 0) * RS_TO_RADIANS;
                const cos = Math.cos(yaw);
                const sin = Math.sin(yaw);
                worldX += (midX * cos + midZ * sin) / 128.0;
                worldZ += (-midX * sin + midZ * cos) / 128.0;
            } catch {}
        } catch {}

        return {
            worldX,
            worldZ,
            logicalHeightTiles,
        };
    
}

export function getEffectiveControlledPlayerId(host: WebGLOsrsRendererHost, ): number {

        const actual = host.osrsClient.controlledPlayerServerId | 0;
        if (actual > 0) {
            if (
                host.pendingControlledPlayerServerId !== undefined &&
                host.pendingControlledPlayerServerId !== actual
            ) {
                host.pendingControlledPlayerServerId = undefined;
            }
            return actual;
        }
        if (host.pendingControlledPlayerServerId !== undefined) {
            return host.pendingControlledPlayerServerId | 0;
        }
        return 0;
    
}

export function ensureHitsplatState(host: WebGLOsrsRendererHost, 
        map: Map<number, ActorHitsplatState>,
        serverId: number,
    ): ActorHitsplatState {

        let state = map.get(serverId);
        if (state) return state;
        state = createActorHitsplatState();
        map.set(serverId, state);
        return state;
    
}
