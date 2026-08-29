/**
 * Network managers module.
 *
 * Contains specialized managers for network-related functionality,
 * extracted from wsServer for better organization and testability.
 */

export {
    NpcSyncManager,
    type HealthBarUpdatePayload,
    type NpcViewSnapshot,
    type NpcUpdatePayload,
    type NpcPacketBuffer,
    type NpcTickFrame,
} from "@server/network/managers/NpcSyncManager";

export {
    PlayerAppearanceManager,
    type PlayerAnimSet,
    type AppearanceSnapshotEntry,
} from "@server/network/managers/PlayerAppearanceManager";

export {
    SoundManager,
    type SoundBroadcastRequest,
    type LocSoundRequest,
    type AreaSoundRequest,
    type TickFrameRef,
    type MusicCatalogTrackRef,
} from "@server/network/managers/SoundManager";

export {
    GroundItemHandler,
    type GroundItemActionPayload,
    type GroundItemsServerPayload,
} from "@server/network/managers/GroundItemHandler";

export { Cs2ModalManager } from "@server/network/managers/Cs2ModalManager";
