import type { LoginRendererHost } from "@client/features/login/renderer/host";

export function dispose(host: LoginRendererHost): void {

        // Abort title assets and world/server probes before releasing their host.
        // These requests can otherwise finish after HMR/unmount and repopulate
        // ImageBitmap/DOM/WebSocket resources on an already-disposed client.
        host.lifecycleAbortController.abort();
        host.probing = false;

        if (host.logoImage) {
            host.logoImage.onload = null;
            host.logoImage.onerror = null;
        }

        // Clear sprite references
        host.logoSprite = undefined;
        host.logoImage = undefined;
        host.logoImageLoaded = false;
        host.titleboxSprite = undefined;
        host.titlebuttonSprite = undefined;
        host.titlebuttonLargeSprite = undefined;
        host.playNowTextSprite = undefined;
        host.runesSprites = undefined;
        host.titleMuteSprites = undefined;
        host.optionsRadioSprite0 = undefined;
        host.optionsRadioSprite2 = undefined;
        host.optionsRadioSprite4 = undefined;
        host.optionsRadioSprite6 = undefined;
        host.worldSelectLeftSprite = undefined;
        host.worldSelectRightSprite = undefined;
        host.worldSelectButtonSprite = undefined;

        // Clear font references
        host.fontBold12 = undefined;
        host.fontPlain11 = undefined;
        host.fontPlain12 = undefined;

        // Clear title background
        if (host.titleBackgroundImage) {
            if ("close" in host.titleBackgroundImage) {
                host.titleBackgroundImage.close();
            }
            host.titleBackgroundImage = undefined;
        }

        // Clear animation
        if (host.loginScreenRunesAnimation) {
            host.loginScreenRunesAnimation.destroy();
            host.loginScreenRunesAnimation = undefined;
        }

        // Clear canvas references
        host.canvas = undefined;
        host.ctx = undefined;
    
}

export function resetAnimationState(host: LoginRendererHost): void {

        host.cycle = 0;
        host.lastTickTime = 0;
        host.caretBlinkMs = 0;
        if (host.loginScreenRunesAnimation) {
            host.loginScreenRunesAnimation.reset();
        }
    
}
