/**
 * OSRS Vorbis Decoder Module
 *
 * This is a port of the OSRS custom Vorbis decoder.
 * OSRS uses a modified Vorbis format that is NOT compatible with standard Ogg Vorbis.
 */
export { VorbisBitReader, sharedBitReader } from "@august/osrs-engine/audio/vorbis/VorbisBitReader";
export { VorbisCodebook } from "@august/osrs-engine/audio/vorbis/VorbisCodebook";
export { VorbisFloor, type VorbisFloorState } from "@august/osrs-engine/audio/vorbis/VorbisFloor";
export { VorbisResidue } from "@august/osrs-engine/audio/vorbis/VorbisResidue";
export { VorbisMapping } from "@august/osrs-engine/audio/vorbis/VorbisMapping";
export {
    VorbisSample,
    initVorbisSetup,
    isSetupInitialized,
    resetSetup,
    type RawSoundData,
} from "@august/osrs-engine/audio/vorbis/VorbisSample";
export { iLog, bitReverse, float32Unpack } from "@august/osrs-engine/audio/vorbis/VorbisUtils";
