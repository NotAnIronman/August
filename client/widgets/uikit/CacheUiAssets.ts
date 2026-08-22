import type { WidgetManager } from "../WidgetManager";
import type { WidgetNode } from "../WidgetNode";

/**
 * The cache-backed visual vocabulary available to UIKit. Keep entries semantic
 * (what UIKit needs) rather than scattering archive IDs through panel code.
 *
 * Named entries are stable cache archive/frame tokens. Widget entries retain
 * their source interface so a cache revision can select the appropriate
 * sprite without baking a revision-specific numeric sprite ID into UIKit.
 */
export const CacheUiAssetKey = {
    MENU_BUTTON_BACKGROUND: "menu.settings-tab-button",
    SCROLLBAR_ARROW_UP: "scrollbar.arrow-up",
    SCROLLBAR_ARROW_DOWN: "scrollbar.arrow-down",
    SCROLLBAR_TRACK: "scrollbar.track",
    SCROLLBAR_THUMB_TOP: "scrollbar.thumb-top",
    SCROLLBAR_THUMB_CENTRE: "scrollbar.thumb-centre",
    SCROLLBAR_THUMB_BOTTOM: "scrollbar.thumb-bottom",
    SETTINGS_SLIDER_LEFT_CAP: "settings.slider-left-cap",
    SETTINGS_SLIDER_MIDDLE: "settings.slider-middle",
    SETTINGS_SLIDER_RIGHT_CAP: "settings.slider-right-cap",
    SETTINGS_SLIDER_BOBBLE: "settings.slider-bobble",
} as const;

export type CacheUiAssetKey = (typeof CacheUiAssetKey)[keyof typeof CacheUiAssetKey];

type NamedSpriteAsset = {
    kind: "named-sprite";
    token: string;
    description: string;
};

type SettingsWidgetSpriteAsset = {
    kind: "settings-widget-sprite";
    sourceGroups: readonly number[];
    description: string;
};

export type CacheUiAsset = NamedSpriteAsset | SettingsWidgetSpriteAsset;

/**
 * Initial curated compendium. This is deliberately data-only so new cache
 * discoveries add one entry here and can be reused by any UIKit panel.
 */
export const CACHE_UI_ASSETS: Readonly<Record<CacheUiAssetKey, CacheUiAsset>> = {
    [CacheUiAssetKey.MENU_BUTTON_BACKGROUND]: {
        kind: "settings-widget-sprite",
        // Settings modal first: it contains the visual tab treatment. The
        // side panel supplies a safe alternative for revisions where its tabs
        // are dynamically built by CS2 rather than stored statically.
        sourceGroups: [134, 116],
        description: "Settings tab/button background, discovered from the native interface.",
    },
    [CacheUiAssetKey.SCROLLBAR_ARROW_UP]: {
        kind: "named-sprite", token: "scrollbar_v2,0", description: "Native scrollbar up arrow.",
    },
    [CacheUiAssetKey.SCROLLBAR_ARROW_DOWN]: {
        kind: "named-sprite", token: "scrollbar_v2,1", description: "Native scrollbar down arrow.",
    },
    [CacheUiAssetKey.SCROLLBAR_TRACK]: {
        kind: "named-sprite", token: "scrollbar_dragger_v2,3", description: "Native scrollbar track.",
    },
    [CacheUiAssetKey.SCROLLBAR_THUMB_TOP]: {
        kind: "named-sprite", token: "scrollbar_dragger_v2,0", description: "Native scrollbar thumb top.",
    },
    [CacheUiAssetKey.SCROLLBAR_THUMB_CENTRE]: {
        kind: "named-sprite", token: "scrollbar_dragger_v2,1", description: "Native scrollbar thumb centre.",
    },
    [CacheUiAssetKey.SCROLLBAR_THUMB_BOTTOM]: {
        kind: "named-sprite", token: "scrollbar_dragger_v2,2", description: "Native scrollbar thumb bottom.",
    },
    [CacheUiAssetKey.SETTINGS_SLIDER_LEFT_CAP]: {
        kind: "named-sprite", token: "settings_slider,0", description: "Settings slider left cap.",
    },
    [CacheUiAssetKey.SETTINGS_SLIDER_MIDDLE]: {
        kind: "named-sprite", token: "settings_slider,3", description: "Settings slider middle segment.",
    },
    [CacheUiAssetKey.SETTINGS_SLIDER_RIGHT_CAP]: {
        kind: "named-sprite", token: "settings_slider,5", description: "Settings slider right cap.",
    },
    [CacheUiAssetKey.SETTINGS_SLIDER_BOBBLE]: {
        kind: "named-sprite", token: "settings_slider,6", description: "Settings slider enabled knob.",
    },
};

type ResolvedWidgetSprite = {
    groupId: number;
    componentId: number;
    spriteId: number;
    spriteTiling: boolean;
    borderType?: number;
    graphicShadow?: number;
    hFlip?: boolean;
    vFlip?: boolean;
};

const resolvedSettingsButtonByManager = new WeakMap<
    object,
    { value: ResolvedWidgetSprite | undefined }
>();

function spriteIdOf(widget: WidgetNode): number {
    return typeof widget.spriteId === "number" && widget.spriteId >= 0 ? widget.spriteId | 0 : -1;
}

function sourceDimension(widget: WidgetNode, dimension: "width" | "height"): number {
    const raw = dimension === "width" ? widget.rawWidth : widget.rawHeight;
    const laidOut = dimension === "width" ? widget.width : widget.height;
    return Math.max(0, Number(raw ?? laidOut ?? 0) | 0);
}

/**
 * Locate the broad, stateful sprite used for a native Settings tab/button.
 * Cache revisions move component IDs, so dimensions, state sprites, and
 * tiling are a safer contract than a brittle single component number.
 */
function resolveSettingsButtonSprite(widgetManager: WidgetManager): ResolvedWidgetSprite | undefined {
    const cached = resolvedSettingsButtonByManager.get(widgetManager);
    if (cached) return cached.value;

    const definition = CACHE_UI_ASSETS[CacheUiAssetKey.MENU_BUTTON_BACKGROUND] as SettingsWidgetSpriteAsset;
    let best: { score: number; source: WidgetNode } | undefined;
    for (let groupOrder = 0; groupOrder < definition.sourceGroups.length; groupOrder++) {
        const groupId = definition.sourceGroups[groupOrder];
        let widgets = widgetManager.getWidgetsForGroup(groupId);
        if (widgets.length === 0) {
            try {
                widgetManager.loadGroup(groupId);
                widgets = widgetManager.getWidgetsForGroup(groupId);
            } catch {
                continue;
            }
        }
        for (const source of widgets) {
            if ((source.type ?? 0) !== 5 || spriteIdOf(source) < 0) continue;
            const width = sourceDimension(source, "width");
            const height = sourceDimension(source, "height");
            const aspect = height > 0 ? width / height : 0;
            let score = groupOrder === 0 ? 200 : 100;
            // Native backgrounds normally have a hover/active companion.
            if (typeof source.spriteId2 === "number" && source.spriteId2 >= 0) score += 500;
            // Prefer a button-shaped sprite over a single square tab icon.
            if (width >= 28 && height >= 12) score += 120;
            if (aspect >= 1.25 && aspect <= 8) score += 220;
            if (source.spriteTiling) score += 140;
            if (width <= 18 || height <= 10) score -= 160;
            if (!best || score > best.score) best = { score, source };
        }
    }

    const source = best?.source;
    const resolved = source
        ? {
              groupId: source.groupId | 0,
              componentId: source.fileId | 0,
              spriteId: spriteIdOf(source),
              spriteTiling: source.spriteTiling === true,
              borderType: source.borderType,
              graphicShadow: source.graphicShadow,
              hFlip: source.horizontalFlip ?? source.hFlip,
              vFlip: source.verticalFlip ?? source.vFlip,
          }
        : undefined;
    // Use a sentinel so panels do not repeatedly rescan source interfaces.
    resolvedSettingsButtonByManager.set(widgetManager, { value: resolved });
    return resolved;
}

/** Applies declared UIKit cache skins to every loaded widget in one panel. */
export function syncCacheUiAssetsForGroup(widgetManager: WidgetManager, groupId: number): void {
    const widgets = widgetManager.getWidgetsForGroup(groupId);
    for (const widget of widgets) {
        const assetKey = widget.cacheUiAsset as CacheUiAssetKey | undefined;
        if (!assetKey) continue;
        const asset = CACHE_UI_ASSETS[assetKey];
        if (!asset) continue;

        if (asset.kind === "named-sprite") {
            const signature = `${assetKey}:${asset.token}`;
            if ((widget as any).__cacheUiAssetSignature === signature) continue;
            widget.type = 5;
            widget.isIf3 = true;
            widget.itemId = -1;
            widget.cacheSpriteToken = asset.token;
            widget.spriteId = -1;
            widget.spriteId2 = -1;
            widget.transparency = 0;
            (widget as any).__cacheUiAssetSignature = signature;
            widgetManager.invalidateWidgetRender(widget, "cache-ui-asset");
            continue;
        }

        const source = resolveSettingsButtonSprite(widgetManager);
        if (!source) continue; // Retain the panel's ordinary rectangle fallback.
        const signature = `${assetKey}:${source.groupId}:${source.componentId}:${source.spriteId}`;
        if ((widget as any).__cacheUiAssetSignature === signature) continue;
        widget.type = 5;
        widget.isIf3 = true;
        widget.itemId = -1;
        widget.cacheSpriteToken = undefined;
        widget.spriteId = source.spriteId;
        widget.spriteId2 = -1;
        widget.spriteTiling = source.spriteTiling;
        widget.borderType = source.borderType;
        widget.graphicShadow = source.graphicShadow;
        widget.horizontalFlip = source.hFlip;
        widget.verticalFlip = source.vFlip;
        widget.transparency = 0;
        (widget as any).__cacheUiAssetSignature = signature;
        (widget as any).__cacheUiAssetSource = source;
        widgetManager.invalidateWidgetRender(widget, "cache-ui-asset");
    }
}
