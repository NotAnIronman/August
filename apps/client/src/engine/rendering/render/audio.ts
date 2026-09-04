
import type { AmbientSoundInstance } from "@client/engine/audio/SoundEffectSystem";
import { WebGLMapSquare } from "@client/engine/rendering/WebGLMapSquare";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function addAmbientSoundInstance(host: WebGLOsrsRendererHost, 
        locId: number,
        soundType: any,
        x: number,
        y: number,
        z: number,
        orientation: number,
        sizeX: number,
        sizeY: number,
    ): void {

        const idx = host.ambientSoundBufferIndex;
        const buffer = host.ambientSoundBuffer;

        // Reuse existing object or create new one
        let inst = buffer[idx];
        if (!inst) {
            inst = {} as AmbientSoundInstance;
            buffer[idx] = inst;
        }

        // Update all properties
        inst.locId = locId;
        inst.soundId = soundType ? soundType.ambientSoundId : -1;
        inst.x = x;
        inst.y = y;
        inst.z = z;
        inst.maxDistance = soundType ? soundType.soundMaxDistance : 0;
        inst.minDistance = soundType ? soundType.soundMinDistance : 0;
        inst.changeTicksMin = soundType ? soundType.ambientSoundChangeTicksMin : 0;
        inst.changeTicksMax = soundType ? soundType.ambientSoundChangeTicksMax : 0;
        inst.soundIds = soundType ? soundType.ambientSoundIds : undefined;
        inst.sizeX = sizeX;
        inst.sizeY = sizeY;
        inst.orientation = orientation;
        inst.fadeInDurationMs = (soundType && soundType.soundFadeInDuration) || undefined;
        inst.fadeOutDurationMs = (soundType && soundType.soundFadeOutDuration) || undefined;
        inst.fadeInCurve = (soundType && soundType.soundFadeInCurve) || undefined;
        inst.fadeOutCurve = (soundType && soundType.soundFadeOutCurve) || undefined;
        inst.distanceFadeCurve = (soundType && soundType.soundDistanceFadeCurve) || undefined;
        inst.distanceOverride = soundType
            ? (soundType.soundAreaRadiusOverride ?? undefined)
            : undefined;
        inst.loopSequentially = soundType ? soundType.loopMultiSoundSequentially : false;
        inst.deferSwap = soundType ? soundType.deferredAmbientSwap : false;
        inst.exactPosition = soundType ? soundType.useExactSoundPosition : false;
        inst.resetOnLoop = soundType ? soundType.resetAmbientOnLoopRestart : false;

        host.ambientSoundBufferIndex = idx + 1;
    
}

export function locTypeHasSound(locType: any): boolean{

        return (
            !!locType &&
            (locType.ambientSoundId !== -1 ||
                (locType.ambientSoundIds && locType.ambientSoundIds.length > 0))
        );
    
}

export function locHasSoundPotential(host: WebGLOsrsRendererHost, locId: number): boolean {

        const cached = host.locSoundPotentialCache.get(locId);
        if (cached !== undefined) return cached;
        let result = false;
        const locType = host.osrsClient.locTypeLoader.load(locId);
        if (locType) {
            result = locTypeHasSound(locType);
            if (!result && locType.transforms) {
                for (const transformId of locType.transforms) {
                    if (transformId === -1) continue;
                    const transformed = host.osrsClient.locTypeLoader.load(transformId);
                    if (locTypeHasSound(transformed)) {
                        result = true;
                        break;
                    }
                }
            }
        }
        host.locSoundPotentialCache.set(locId, result);
        return result;
    
}

export function getMapSoundEmitters(host: WebGLOsrsRendererHost, 
        map: WebGLMapSquare,
    ): { locId: number; x: number; y: number; level: number; rot: number }[] {

        if (map.ambientSoundEmitters) return map.ambientSoundEmitters;

        const emitters: { locId: number; x: number; y: number; level: number; rot: number }[] = [];
        const mapBaseX = map.mapX * 64;
        const mapBaseY = map.mapY * 64;
        const offsetsByLevel = map.tileLocOffsetsByLevel;
        const idsByLevel = map.tileLocIdsByLevel;
        const typeRotsByLevel = map.tileLocTypeRotByLevel;

        if (offsetsByLevel && idsByLevel) {
            for (let level = 0; level < offsetsByLevel.length; level++) {
                const offsets = offsetsByLevel[level];
                const ids = idsByLevel[level];
                if (!offsets || !ids || offsets.length < 2) continue;
                const typeRots = typeRotsByLevel?.[level];
                const span = Math.round(Math.sqrt(offsets.length - 1));

                for (let localY = 0; localY < span; localY++) {
                    for (let localX = 0; localX < span; localX++) {
                        const tileIdx = localY * span + localX;
                        const start = offsets[tileIdx] | 0;
                        const end = offsets[tileIdx + 1] | 0;
                        for (let i = start; i < end; i++) {
                            const locId = ids[i] | 0;
                            if (!host.locHasSoundPotential(locId)) continue;
                            const packed = typeRots ? typeRots[i] | 0 : 0;
                            emitters.push({
                                locId,
                                x: (mapBaseX + localX) * 128 + 64,
                                y: (mapBaseY + localY) * 128 + 64,
                                level,
                                rot: (packed >> 6) & 3,
                            });
                        }
                    }
                }
            }
        }

        map.ambientSoundEmitters = emitters;
        return emitters;
    
}

export function addAmbientEmitter(host: WebGLOsrsRendererHost, 
        locId: number,
        x: number,
        y: number,
        level: number,
        rot: number,
    ): void {

        const baseType = host.osrsClient.locTypeLoader.load(locId);
        if (!baseType) return;

        // Resolve varbit transforms for the active sound fields; the emitter
        // persists with no sound while the active transform is silent so it
        // can fade between states without losing loop phase or timers.
        let soundType: any = baseType;
        if (baseType.transforms) {
            soundType = baseType.transform(
                host.osrsClient.varManager,
                host.osrsClient.locTypeLoader,
            );
        }
        if (soundType && !locTypeHasSound(soundType)) {
            soundType = undefined;
        }

        host.addAmbientSoundInstance(
            locId,
            soundType,
            x,
            y,
            level * 128,
            rot,
            baseType.sizeX || 1,
            baseType.sizeY || 1,
        );
    
}

export function collectAmbientSounds(host: WebGLOsrsRendererHost, map: WebGLMapSquare): void {

        // Animated locs (sparse, iterate all levels)
        if (map.locsAnimated) {
            for (const loc of map.locsAnimated) {
                if (!host.locHasSoundPotential(loc.id)) continue;
                host.addAmbientEmitter(loc.id, loc.x, loc.y, loc.level, loc.rotation);
            }
        }

        // Static locs from the cached per-map emitter list
        const emitters = host.getMapSoundEmitters(map);
        for (let i = 0; i < emitters.length; i++) {
            const emitter = emitters[i];
            host.addAmbientEmitter(emitter.locId, emitter.x, emitter.y, emitter.level, emitter.rot);
        }
    
}
