
import { ActorAnimationClip } from "@client/engine/game/actor/ActorAnimation";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function _buildAnimClipMeta(host: WebGLOsrsRendererHost, seqId: number): ActorAnimationClip | undefined {

        return host.playerRenderer.buildAnimClipMeta(seqId);
    
}
