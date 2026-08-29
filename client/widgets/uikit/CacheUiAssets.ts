import type { WidgetManager } from "../WidgetManager";
import type { WidgetNode } from "../WidgetNode";
import { resolveSpriteByCommonName } from "./SpriteNameCache";

/**
 * Curated cache-backed visual vocabulary for UIKit. Add a semantic alias here
 * only after a developer has named a source component in the asset inspector.
 */
export const CacheUiAssetKey = {
    /** Native UI chrome available in the current cache. */
    TAB_IDLE: "ui.tab-base",
    TAB_ACTIVE: "ui.tab-hover",
    RADIO_OFF: "ui.radio-unchecked",
    RADIO_ON: "ui.radio-checked",
    PAGE_PREVIOUS: "ui.page-left",
    PAGE_NEXT: "ui.page-right",
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

export type CacheSpriteAssetReference = {
    archiveId: number;
    frame: number;
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

type ArchiveSpriteAsset = {
    kind: "archive-sprite";
    source: CacheSpriteAssetReference;
    description: string;
};

export type CacheUiAsset = NamedSpriteAsset | WidgetSpriteAsset | ArchiveSpriteAsset;

/**
 * The default visual vocabulary for code-built interfaces.  This is a
 * deliberately small set of *correct* native assets, not a random cache
 * sprite sprayed over every rectangle.  New discoveries can be used straight
 * away with cache.sprite/cache.widget keys, then promoted here when they are
 * proven to be a stable reusable UI primitive.
 */
export const NATIVE_UIKIT_SKIN = {
    tabs: {
        backgroundAsset: CacheUiAssetKey.TAB_IDLE,
        activeAsset: CacheUiAssetKey.TAB_ACTIVE,
    },
    scrollbar: {
        arrowUp: CacheUiAssetKey.SCROLLBAR_ARROW_UP,
        arrowDown: CacheUiAssetKey.SCROLLBAR_ARROW_DOWN,
        track: CacheUiAssetKey.SCROLLBAR_TRACK,
        thumbTop: CacheUiAssetKey.SCROLLBAR_THUMB_TOP,
        thumbCentre: CacheUiAssetKey.SCROLLBAR_THUMB_CENTRE,
        thumbBottom: CacheUiAssetKey.SCROLLBAR_THUMB_BOTTOM,
    },
    pagination: {
        previous: CacheUiAssetKey.PAGE_PREVIOUS,
        next: CacheUiAssetKey.PAGE_NEXT,
    },
    button: {
        // Not yet promoted to a semantic CacheUiAssetKey name (no ::Rename
        // has been run on it yet) - raw archive:frame keeps working exactly
        // like the named aliases above once someone does name it. 293:0 is
        // already the proven idle background for the Menu Grid buttons in
        // devUIKitPanels.ts; 294:0 is its already-validated hover partner.
        // Swap either for "cache.sprite.295.0" (also confirmed to look
        // correct) if a future revision prefers that frame instead.
        backgroundAsset: "cache.sprite.293.0",
        hoverAsset: "cache.sprite.294.0",
    },
} as const;

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

/** Stable reference for an individual frame in the full cache sprite gallery. */
export function cacheSpriteAssetKey(archiveId: number, frame = 0): string {
    return `cache.sprite.${archiveId | 0}.${Math.max(0, frame | 0)}`;
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

function parseCacheSpriteAssetKey(key: string): CacheSpriteAssetReference | undefined {
    const match = /^cache\.sprite\.(\d+)\.(\d+)$/.exec(key);
    if (!match) return undefined;
    return { archiveId: Number(match[1]) | 0, frame: Number(match[2]) | 0 };
}

/** Initial named entries whose cache identifiers are already known and stable. */
export const CACHE_UI_ASSETS: Readonly<Partial<Record<CacheUiAssetKey, NamedSpriteAsset>>> = {
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
    [CacheUiAssetKey.TAB_IDLE]: {
        kind: "archive-sprite",
        source: { archiveId: 185, frame: 0 },
        description: "Native inactive tab background.",
    },
    [CacheUiAssetKey.TAB_ACTIVE]: {
        kind: "archive-sprite",
        source: { archiveId: 186, frame: 0 },
        description: "Native active tab background.",
    },
    [CacheUiAssetKey.RADIO_OFF]: {
        kind: "archive-sprite",
        source: { archiveId: 180, frame: 0 },
        description: "Native unchecked radio button.",
    },
    [CacheUiAssetKey.RADIO_ON]: {
        kind: "archive-sprite",
        source: { archiveId: 181, frame: 0 },
        description: "Native checked radio button.",
    },
    [CacheUiAssetKey.PAGE_PREVIOUS]: {
        kind: "archive-sprite",
        source: { archiveId: 308, frame: 0 },
        description: "Native previous-page arrow.",
    },
    [CacheUiAssetKey.PAGE_NEXT]: {
        kind: "archive-sprite",
        source: { archiveId: 309, frame: 0 },
        description: "Native next-page arrow.",
    },
    "settings.brightness-icon": {
        kind: "widget-sprite",
        source: { groupId: 116, componentId: 11, field: "sprite" },
        description: "Settings sidebar brightness/sun icon (sprite 659 in the current cache).",
    },
    "settings.display-icon": {
        kind: "widget-sprite",
        source: { groupId: 116, componentId: 82, field: "sprite" },
        description: "Settings sidebar display icon (sprite 2932 in the current cache).",
    },
    "settings.volume-knob": {
        kind: "widget-sprite",
        source: { groupId: 116, componentId: 137, field: "sprite" },
        description: "Settings sidebar volume slider knob (sprite 4894 in the current cache).",
    },
    "settings.volume-bar-left": {
        kind: "widget-sprite",
        source: { groupId: 116, componentId: 14, field: "sprite" },
        description: "Settings sidebar volume bar left cap (sprite 2852 in the current cache).",
    },
    "settings.volume-bar-right": {
        kind: "widget-sprite",
        source: { groupId: 116, componentId: 135, field: "sprite" },
        description: "Settings sidebar volume bar right cap (sprite 2857 in the current cache).",
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
    const widgetSource = parseCacheWidgetAssetKey(assetKey);
    if (widgetSource) {
        return { kind: "widget-sprite", source: widgetSource, description: "Unlabelled cache component reference." };
    }
    const spriteSource = parseCacheSpriteAssetKey(assetKey);
    if (spriteSource) {
        return { kind: "archive-sprite", source: spriteSource, description: "Unlabelled cache sprite frame." };
    }
    // Anything named via ::Rename (client/public/spriteNames.json) resolves
    // directly - no separate promotion into CACHE_UI_ASSET_ALIASES needed.
    // That hand-curated dictionary is still worth using for assets that need
    // extra metadata (e.g. pulling a sprite off an existing widget component
    // rather than a standalone archive), but for the common case - "I named
    // it, now I want to use it" - this is the whole workflow.
    const named = resolveSpriteByCommonName(assetKey);
    return named
        ? { kind: "archive-sprite", source: named, description: `Named via ::Rename as "${assetKey}".` }
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

type CacheUiFallback = Pick<
    WidgetNode,
    | "type"
    | "isIf3"
    | "filled"
    | "color"
    | "mouseOverColor"
    | "opacity"
    | "transparency"
    | "spriteId"
    | "spriteId2"
    | "cacheSpriteToken"
    | "cacheSpriteArchiveId"
    | "cacheSpriteFrame"
    | "cacheSpriteTokenHover"
    | "cacheSpriteArchiveIdHover"
    | "cacheSpriteFrameHover"
    | "spriteTiling"
    | "borderType"
    | "graphicShadow"
    | "horizontalFlip"
    | "verticalFlip"
>;

const CACHE_UI_FALLBACK_FIELDS: ReadonlyArray<keyof CacheUiFallback> = [
    "type", "isIf3", "filled", "color", "mouseOverColor", "opacity", "transparency",
    "spriteId", "spriteId2", "cacheSpriteToken", "cacheSpriteArchiveId", "cacheSpriteFrame",
    "cacheSpriteTokenHover", "cacheSpriteArchiveIdHover", "cacheSpriteFrameHover", "spriteTiling",
    "borderType", "graphicShadow", "horizontalFlip", "verticalFlip",
];

function captureFallback(widget: WidgetNode): void {
    if ((widget as any).__cacheUiAssetFallback) return;
    const fallback: Partial<CacheUiFallback> = {};
    for (const field of CACHE_UI_FALLBACK_FIELDS) {
        fallback[field] = widget[field] as never;
    }
    (widget as any).__cacheUiAssetFallback = fallback;
}

/** Restore the widget exactly as the panel builder created it.  The old
 * implementation restored every failed asset as a menu button, which made
 * cache-first skinning unsafe for search fields, tabs, and future controls. */
function restoreFallback(widget: WidgetNode): void {
    const fallback = (widget as any).__cacheUiAssetFallback as Partial<CacheUiFallback> | undefined;
    if (!fallback) return;
    for (const field of CACHE_UI_FALLBACK_FIELDS) {
        (widget as any)[field] = fallback[field];
    }
    (widget as any).__cacheUiAssetFallback = undefined;
}

/** Resolves widget.cacheUiAssetHover (if any) into the matching hover-swap
 *  field for whichever sprite path the default asset used. Called after the
 *  default asset is applied in each of the three branches below. */
function applyHoverAsset(widgetManager: WidgetManager, widget: WidgetNode): void {
    const hoverKey = widget.cacheUiAssetHover;
    const hoverAsset = hoverKey ? resolveAssetDefinition(hoverKey) : undefined;

    widget.cacheSpriteTokenHover = undefined;
    widget.cacheSpriteArchiveIdHover = undefined;
    widget.cacheSpriteFrameHover = undefined;
    widget.spriteId2 = -1;

    if (!hoverAsset) return;
    if (hoverAsset.kind === "named-sprite") {
        widget.cacheSpriteTokenHover = hoverAsset.token;
    } else if (hoverAsset.kind === "archive-sprite") {
        widget.cacheSpriteArchiveIdHover = hoverAsset.source.archiveId;
        widget.cacheSpriteFrameHover = hoverAsset.source.frame;
    } else {
        const resolved = resolveWidgetSprite(widgetManager, hoverAsset.source);
        if (resolved) widget.spriteId2 = resolved.spriteId;
    }
}

/** Applies declared cache skins to every loaded widget in one UIKit panel. */
export function syncCacheUiAssetsForGroup(widgetManager: WidgetManager, groupId: number): void {
    const widgets = widgetManager.getWidgetsForGroup(groupId);
    for (const widget of widgets) {
        const assetKey = widget.cacheUiAsset;
        if (!assetKey) continue;
        const asset = resolveAssetDefinition(assetKey);
        if (!asset) {
            // A renamed/deleted gallery reference can disappear while a
            // panel is open. Restore its own original visual, regardless of
            // whether it was a button, field, tab, or future component.
            if ((widget as any).__cacheUiAssetSignature) {
                restoreFallback(widget);
                (widget as any).__cacheUiAssetSignature = undefined;
                widgetManager.invalidateWidgetRender(widget, "cache-ui-asset-reset");
            }
            continue;
        }

        captureFallback(widget);

        if (asset.kind === "named-sprite") {
            const signature = `${assetKey}:${asset.token}:${widget.cacheUiAssetHover ?? ""}`;
            if ((widget as any).__cacheUiAssetSignature === signature) continue;
            widget.type = 5;
            widget.isIf3 = true;
            widget.itemId = -1;
            widget.cacheSpriteToken = asset.token;
            widget.cacheSpriteArchiveId = undefined;
            widget.cacheSpriteFrame = undefined;
            widget.spriteId = -1;
            widget.transparency = 0;
            applyHoverAsset(widgetManager, widget);
            (widget as any).__cacheUiAssetSignature = signature;
            widgetManager.invalidateWidgetRender(widget, "cache-ui-asset");
            continue;
        }

        if (asset.kind === "archive-sprite") {
            const signature =
                `${assetKey}:${asset.source.archiveId}:${asset.source.frame}` +
                `:${widget.cacheUiAssetHover ?? ""}`;
            if ((widget as any).__cacheUiAssetSignature === signature) continue;
            widget.type = 5;
            widget.isIf3 = true;
            widget.itemId = -1;
            widget.cacheSpriteToken = undefined;
            widget.cacheSpriteArchiveId = asset.source.archiveId;
            widget.cacheSpriteFrame = asset.source.frame;
            widget.spriteId = -1;
            widget.transparency = 0;
            applyHoverAsset(widgetManager, widget);
            (widget as any).__cacheUiAssetSignature = signature;
            widgetManager.invalidateWidgetRender(widget, "cache-ui-asset");
            continue;
        }

        const resolved = resolveWidgetSprite(widgetManager, asset.source);
        if (!resolved) continue;
        const signature = `${assetKey}:${resolved.spriteId}:${widget.cacheUiAssetHover ?? ""}`;
        if ((widget as any).__cacheUiAssetSignature === signature) continue;
        widget.type = 5;
        widget.isIf3 = true;
        widget.itemId = -1;
        widget.cacheSpriteToken = undefined;
        widget.cacheSpriteArchiveId = undefined;
        widget.cacheSpriteFrame = undefined;
        widget.spriteId = resolved.spriteId;
        widget.spriteTiling = resolved.spriteTiling;
        widget.borderType = resolved.borderType;
        widget.graphicShadow = resolved.graphicShadow;
        widget.horizontalFlip = resolved.hFlip;
        widget.verticalFlip = resolved.vFlip;
        widget.transparency = 0;
        applyHoverAsset(widgetManager, widget);
        (widget as any).__cacheUiAssetSignature = signature;
        widgetManager.invalidateWidgetRender(widget, "cache-ui-asset");
    }
}
