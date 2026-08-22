import type { WidgetManager } from "../WidgetManager";
import type { WidgetNode } from "../WidgetNode";

/**
 * Curated cache-backed visual vocabulary for UIKit. Add a semantic alias here
 * only after a developer has named a source component in the asset inspector.
 */
export const CacheUiAssetKey = {
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
export type CacheWidgetAssetField = "sprite" | "alternate";

export type CacheWidgetAssetReference = {
    groupId: number;
    componentId: number;
    field: CacheWidgetAssetField;
};

type NamedSpriteAsset = {
    kind: "named-sprite";
    token: string;
    description: string;
};

type WidgetSpriteAsset = {
    kind: "widget-sprite";
    source: CacheWidgetAssetReference;
    description: string;
};

export type CacheUiAsset = NamedSpriteAsset | WidgetSpriteAsset;

/**
 * Stable blank-reference format shown next to every component in the picker.
 * It is deliberately based on interface/component IDs, not the raw sprite ID:
 * the component remains useful if a later cache revision changes its sprite.
 */
export function cacheWidgetComponentKey(groupId: number, componentId: number): string {
    return `cache.widget.${groupId | 0}.${componentId | 0}`;
}

export function cacheWidgetAssetKey(
    groupId: number,
    componentId: number,
    field: CacheWidgetAssetField = "sprite",
): string {
    return `${cacheWidgetComponentKey(groupId, componentId)}.${field}`;
}

function parseCacheWidgetAssetKey(key: string): CacheWidgetAssetReference | undefined {
    const match = /^cache\.widget\.(\d+)\.(\d+)\.(sprite|alternate)$/.exec(key);
    if (!match) return undefined;
    return {
        groupId: Number(match[1]) | 0,
        componentId: Number(match[2]) | 0,
        field: match[3] as CacheWidgetAssetField,
    };
}

/** Initial named entries whose cache identifiers are already known and stable. */
export const CACHE_UI_ASSETS: Readonly<Record<CacheUiAssetKey, NamedSpriteAsset>> = {
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

/**
 * The human-named half of the compendium. Names are assigned only after the
 * developer identifies the cache reference in the picker. Example entry once
 * a tab background is identified:
 *
 * "settings.tab-button": {
 *   kind: "widget-sprite",
 *   source: { groupId: 134, componentId: 42, field: "sprite" },
 *   description: "Settings tab button background.",
 * }
 */
export const CACHE_UI_ASSET_ALIASES: Readonly<Record<string, CacheUiAsset>> = {
    "settings.brightness-icon": {
        kind: "widget-sprite",
        source: { groupId: 116, componentId: 11, field: "sprite" },
        description: "Settings sidebar brightness/sun icon (sprite 659 in the current cache).",
    },
};

type ResolvedWidgetSprite = {
    spriteId: number;
    spriteTiling: boolean;
    borderType?: number;
    graphicShadow?: number;
    hFlip?: boolean;
    vFlip?: boolean;
};

function resolveAssetDefinition(assetKey: string): CacheUiAsset | undefined {
    const curated = (CACHE_UI_ASSETS as Record<string, CacheUiAsset>)[assetKey];
    if (curated) return curated;
    const alias = CACHE_UI_ASSET_ALIASES[assetKey];
    if (alias) return alias;
    const source = parseCacheWidgetAssetKey(assetKey);
    return source
        ? { kind: "widget-sprite", source, description: "Unlabelled cache component reference." }
        : undefined;
}

function resolveWidgetSprite(
    widgetManager: WidgetManager,
    source: CacheWidgetAssetReference,
): ResolvedWidgetSprite | undefined {
    const uid = ((source.groupId & 0xffff) << 16) | (source.componentId & 0xffff);
    let widget = widgetManager.getWidgetByUid(uid);
    if (!widget) {
        try {
            widgetManager.loadGroup(source.groupId);
            widget = widgetManager.getWidgetByUid(uid);
        } catch {
            return undefined;
        }
    }
    if (!widget) return undefined;
    const spriteId = source.field === "alternate" ? widget.spriteId2 : widget.spriteId;
    if (!(typeof spriteId === "number") || spriteId < 0) return undefined;
    return {
        spriteId: spriteId | 0,
        spriteTiling: widget.spriteTiling === true,
        borderType: widget.borderType,
        graphicShadow: widget.graphicShadow,
        hFlip: widget.horizontalFlip ?? widget.hFlip,
        vFlip: widget.verticalFlip ?? widget.vFlip,
    };
}

function restoreDefaultMenuButton(widget: WidgetNode): void {
    widget.type = 3;
    widget.filled = true;
    widget.color = 0x241e16;
    widget.mouseOverColor = 0x3a3022;
    widget.opacity = 104;
    widget.transparency = 0;
    widget.spriteId = -1;
    widget.spriteId2 = -1;
    widget.cacheSpriteToken = undefined;
    widget.spriteTiling = false;
}

/** Applies declared cache skins to every loaded widget in one UIKit panel. */
export function syncCacheUiAssetsForGroup(widgetManager: WidgetManager, groupId: number): void {
    const widgets = widgetManager.getWidgetsForGroup(groupId);
    for (const widget of widgets) {
        const assetKey = widget.cacheUiAsset;
        if (!assetKey) continue;
        const asset = resolveAssetDefinition(assetKey);
        if (!asset) {
            // Clears the temporary auto-selected brightness icon from a live
            // hot-reloaded dev panel and restores the normal UIKit fallback.
            if ((widget as any).__cacheUiAssetSignature) {
                restoreDefaultMenuButton(widget);
                (widget as any).__cacheUiAssetSignature = undefined;
                widget.cacheUiAsset = undefined;
                widgetManager.invalidateWidgetRender(widget, "cache-ui-asset-reset");
            }
            continue;
        }

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

        const resolved = resolveWidgetSprite(widgetManager, asset.source);
        if (!resolved) continue;
        const signature = `${assetKey}:${resolved.spriteId}`;
        if ((widget as any).__cacheUiAssetSignature === signature) continue;
        widget.type = 5;
        widget.isIf3 = true;
        widget.itemId = -1;
        widget.cacheSpriteToken = undefined;
        widget.spriteId = resolved.spriteId;
        widget.spriteId2 = -1;
        widget.spriteTiling = resolved.spriteTiling;
        widget.borderType = resolved.borderType;
        widget.graphicShadow = resolved.graphicShadow;
        widget.horizontalFlip = resolved.hFlip;
        widget.verticalFlip = resolved.vFlip;
        widget.transparency = 0;
        (widget as any).__cacheUiAssetSignature = signature;
        widgetManager.invalidateWidgetRender(widget, "cache-ui-asset");
    }
}
