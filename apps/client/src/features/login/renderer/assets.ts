import { CacheIndex } from "@august/osrs-engine/cache/CacheIndex";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { IndexType } from "@august/osrs-engine/cache/IndexType";
import { BitmapFont } from "@august/osrs-engine/font/BitmapFont";
import { IndexedSprite } from "@august/osrs-engine/sprite/IndexedSprite";
import { SpriteLoader } from "@august/osrs-engine/sprite/SpriteLoader";
import { LoginScreenAnimation } from "@client/features/login/LoginScreenAnimation";
import type { LoginRendererHost } from "@client/features/login/renderer/host";
import { getPublicAssetUrl } from "@client/core/config/publicAssets";
import { clientDebugLog } from "@client/core/diagnostics/clientDiagnostics";
import { fetchWithTimeout } from "@client/core/network/fetchWithTimeout";

const LOGIN_ASSET_TIMEOUT_MS = 10_000;

function loadHtmlImage(
    url: string,
    signal?: AbortSignal,
): Promise<HTMLImageElement | undefined> {
    if (typeof Image === "undefined") return Promise.resolve(undefined);
    return new Promise((resolve) => {
        const image = new Image();
        let settled = false;
        const finish = (value: HTMLImageElement | undefined) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            signal?.removeEventListener("abort", handleAbort);
            image.onload = null;
            image.onerror = null;
            resolve(value);
        };
        const handleAbort = () => finish(undefined);
        const timeout = setTimeout(() => finish(undefined), LOGIN_ASSET_TIMEOUT_MS);
        image.onload = () => finish(image);
        image.onerror = () => finish(undefined);
        if (signal?.aborted) {
            finish(undefined);
            return;
        }
        signal?.addEventListener("abort", handleAbort, { once: true });
        image.src = url;
    });
}

function loadSprite(spriteIndex: CacheIndex, name: string) {

        try {
            const archiveId = spriteIndex.getArchiveId(name);
            if (archiveId === -1) return undefined;
            return SpriteLoader.loadIntoIndexedSprite(spriteIndex, archiveId);
        } catch {
            return undefined;
        }
    
}

function loadSprites(spriteIndex: CacheIndex, name: string) {

        try {
            const archiveId = spriteIndex.getArchiveId(name);
            if (archiveId === -1) return undefined;
            return SpriteLoader.loadIntoIndexedSprites(spriteIndex, archiveId);
        } catch {
            return undefined;
        }
    
}

export function loadLogoImage(host: LoginRendererHost): Promise<boolean> {

        if (host.logoImage && host.logoImageLoaded) {
            return Promise.resolve(true);
        }

        const signal = host.lifecycleAbortController.signal;
        if (signal.aborted) return Promise.resolve(false);

        return new Promise((resolve) => {
            const image = new Image();
            host.logoImage = image;
            let settled = false;
            const finish = (loaded: boolean) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                signal.removeEventListener("abort", handleAbort);
                image.onload = null;
                image.onerror = null;
                const accepted = loaded && !signal.aborted;
                if (host.logoImage === image) {
                    host.logoImageLoaded = accepted;
                    if (!accepted) host.logoImage = undefined;
                }
                resolve(accepted);
            };
            const handleAbort = () => finish(false);
            const timeout = setTimeout(() => finish(false), LOGIN_ASSET_TIMEOUT_MS);
            image.onload = () => {
                clientDebugLog("[LoginRenderer] Logo image loaded from PNG");
                finish(true);
            };
            image.onerror = () => {
                console.warn("[LoginRenderer] Failed to load logo image from PNG");
                finish(false);
            };
            signal.addEventListener("abort", handleAbort, { once: true });
            image.src = getPublicAssetUrl("images/logo.png");
        });
    
}

export async function loadTitleBackground(host: LoginRendererHost): Promise<boolean> {

        const signal = host.lifecycleAbortController.signal;
        if (signal.aborted) return false;
        try {
            const url = getPublicAssetUrl("images/loading-bg.jpg");
            const response = await fetchWithTimeout(url, LOGIN_ASSET_TIMEOUT_MS, { signal });
            if (response.ok) {
                const blob = await response.blob();
                let image: ImageBitmap | HTMLImageElement | undefined;
                if (typeof createImageBitmap === "function") {
                    image = await createImageBitmap(blob);
                } else {
                    image = await loadHtmlImage(url, signal);
                }
                if (!image) return false;
                if (signal.aborted) {
                    if ("close" in image) image.close();
                    return false;
                }
                host.titleBackgroundImage = image;
                clientDebugLog("[LoginRenderer] Title background loaded");
                return true;
            }
        } catch (e) {
            console.warn("[LoginRenderer] Title background load failed:", e);
        }
        return false;
    
}

export function loadTitleSprites(host: LoginRendererHost, cache: CacheSystem) {

        try {
            // Note: Logo PNG image is loaded separately via loadLogoImage()
            // This avoids async race conditions during phased loading

            const spriteIndex = cache.getIndex(IndexType.DAT2.sprites);

            host.logoSprite = loadSprite(spriteIndex, "logo");
            host.titleboxSprite = loadSprite(spriteIndex, "titlebox");
            host.titlebuttonSprite = loadSprite(spriteIndex, "titlebutton");
            host.titlebuttonLargeSprite = loadSprite(spriteIndex, "titlebutton_large");
            host.playNowTextSprite = loadSprite(spriteIndex, "play_now_text");
            host.runesSprites = loadSprites(spriteIndex, "runes");
            host.titleMuteSprites = loadSprites(spriteIndex, "title_mute");

            const radioSprites = loadSprites(spriteIndex, "options_radio_buttons");
            if (radioSprites) {
                host.optionsRadioSprite0 = radioSprites[0];
                host.optionsRadioSprite2 = radioSprites[2];
                host.optionsRadioSprite4 = radioSprites[4];
                host.optionsRadioSprite6 = radioSprites[6];
            }

            host.worldSelectLeftSprite = loadSprite(spriteIndex, "leftarrow");
            host.worldSelectRightSprite = loadSprite(spriteIndex, "rightarrow");
            host.worldSelectButtonSprite = loadSprite(spriteIndex, "sl_button");
            host.worldSelectBackSprites = loadSprites(spriteIndex, "sl_back");
            host.worldSelectFlagSprites = loadSprites(spriteIndex, "sl_flags");
            host.worldSelectStarSprites = loadSprites(spriteIndex, "sl_stars");
            host.worldSelectArrowSprites = loadSprites(spriteIndex, "sl_arrows");

            if (host.runesSprites) {
                host.loginScreenRunesAnimation = new LoginScreenAnimation(host.runesSprites);
            }

            return true;
        } catch (e) {
            console.warn("[LoginRenderer] Failed to load title sprites:", e);
            return false;
        }
    
}

export function loadFonts(host: LoginRendererHost, cache: CacheSystem) {

        try {
            host.fontBold12 = BitmapFont.tryLoad(cache, 496);
            host.fontPlain11 = BitmapFont.tryLoad(cache, 494);
            host.fontPlain12 = BitmapFont.tryLoad(cache, 495);
            return !!(host.fontBold12 && host.fontPlain11 && host.fontPlain12);
        } catch (e) {
            console.warn("[LoginRenderer] Failed to load fonts:", e);
            return false;
        }
    
}
