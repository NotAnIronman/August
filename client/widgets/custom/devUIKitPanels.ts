import {
    DEV_UIKIT_COMPONENT_PICKER_GROUP_ID,
    DEV_UIKIT_COMPONENTS_PANEL_GROUP_ID,
    DEV_UIKIT_ICON_PANEL_GROUP_ID,
    DEV_UIKIT_MENU_PANEL_GROUP_ID,
    DEV_UIKIT_SPRITE_GALLERY_GROUP_ID,
    DEV_UIKIT_TEXT_PANEL_GROUP_ID,
} from "../../common/ui/widgets/custom/journalPanel.cs2";
import { buildUiPanel } from "../uikit/PanelBuilder";
import { ComponentIds } from "../../common/uikit/contracts";
import { createSearchController } from "../uikit/SearchController";
import { registerUiPanel } from "../uikit/registry";
import { createScrollController } from "../uikit/ScrollController";
import {
    cacheWidgetAssetKey,
    cacheWidgetComponentKey,
} from "../uikit/CacheUiAssets";
import { IndexType } from "../../rs/cache/IndexType";
import { SpriteLoader } from "../../rs/sprite/SpriteLoader";
import {
    formatSpriteGalleryLabel,
    getSpriteCommonName,
    getSpriteNamesVersion,
    pollSpriteNames,
} from "../uikit/SpriteNameCache";
import { spriteRefKey } from "../../common/uikit/spriteNames";

const TEXT_ROW_HEIGHT = 18;
const ICON_ROW_HEIGHT = 34;

type GalleryEntry = { archiveId: number; frame: number; width: number; height: number };
type GalleryFilterMode = "all" | "unnamed" | "named" | "skipped";

/** ::Rename'd with this exact name to mean "reviewed, not an icon - skip it
 *  in future passes." Deliberately a normal name (not a separate data file)
 *  so it round-trips through ::Rename and the existing catalog untouched. */
const SKIP_MARKER_NAME = "skip";

// Built once per client session and reused for every page. Paginating over
// archives directly (32 archives/page, 48 cells/page) used to silently drop
// every frame past the 48th in an archive that overflowed a page boundary,
// since the next page resumed at the next archive rather than the leftover
// frames. Indexing every frame up front and paginating the flat list instead
// guarantees every sprite in the cache is reachable exactly once.
let cachedFlatSpriteIndex: GalleryEntry[] | undefined;
let gallerySearchQuery = "";

function buildFlatSpriteIndex(spriteIndex: any): GalleryEntry[] {
    const archiveIds = Array.from(spriteIndex.getArchiveIds?.() ?? [])
        .map((archiveId) => Number(archiveId) | 0)
        .sort((left, right) => left - right);
    const entries: GalleryEntry[] = [];
    for (const archiveId of archiveIds) {
        try {
            const sprites = SpriteLoader.loadIntoIndexedSprites(spriteIndex, archiveId);
            if (!sprites) continue;
            for (let frame = 0; frame < sprites.length; frame++) {
                const sprite = sprites[frame];
                entries.push({
                    archiveId,
                    frame,
                    width: sprite.subWidth | 0,
                    height: sprite.subHeight | 0,
                });
            }
        } catch {
            // Some sprite-index archives are non-visual data. Skip them; the
            // gallery is intentionally a visual browser, not a cache validator.
        }
    }
    return entries;
}

/** Search box callback (see registerUiPanel below) - purely local state,
 *  same convention as filterDevTextRows. Forces a gallery rebuild via the
 *  pickerKey (built from a hash of the query, see cacheSpriteGallery). */
function filterSpriteGallery(query: string, widgetManager: any): void {
    gallerySearchQuery = query.trim().toLowerCase();
    const uid = (componentId: number) =>
        ((DEV_UIKIT_SPRITE_GALLERY_GROUP_ID & 0xffff) << 16) | componentId;
    const sourceWidget = widgetManager.getWidgetByUid(uid(ComponentIds.SPRITE_GALLERY_SOURCE));
    // Any change to the source widget's picker key forces a rebuild; setting
    // text to its own value is a no-op for pagination but the key below also
    // folds in gallerySearchQuery, so cacheSpriteGallery still reprocesses.
    if (sourceWidget) sourceWidget.text = sourceWidget.text ?? "0";
}

function matchesGalleryFilter(
    entry: GalleryEntry,
    filterMode: GalleryFilterMode,
    query: string,
): boolean {
    const name = getSpriteCommonName(entry.archiveId, entry.frame);
    const isSkipped = name === SKIP_MARKER_NAME;
    if (filterMode === "unnamed" && (name !== undefined || isSkipped)) return false;
    if (filterMode === "named" && (name === undefined || isSkipped)) return false;
    if (filterMode === "skipped" && !isSkipped) return false;
    if (filterMode === "all" && isSkipped) return false;
    if (!query) return true;
    if (spriteRefKey(entry.archiveId, entry.frame).includes(query)) return true;
    return !!name && name.toLowerCase().includes(query);
}

function cacheSpriteGallery(widgetManager: any): void {
    const uid = (componentId: number) =>
        ((DEV_UIKIT_SPRITE_GALLERY_GROUP_ID & 0xffff) << 16) | componentId;
    const sourceWidget = widgetManager.getWidgetByUid(uid(ComponentIds.SPRITE_GALLERY_SOURCE));
    // The registry processes every UIKit panel each frame, including panels
    // that have not been opened or loaded yet.
    if (!sourceWidget) return;
    // Cheap no-op most ticks; kicks off a background refresh roughly once a
    // second so a fresh ::Rename shows up without reopening the gallery.
    pollSpriteNames();
    const page = Math.max(0, Number.parseInt(sourceWidget?.text ?? "", 10) || 0);
    const filterWidget = widgetManager.getWidgetByUid(uid(ComponentIds.SPRITE_GALLERY_FILTER));
    const filterMode = ((filterWidget?.text ?? "all") as GalleryFilterMode) || "all";
    // Names version, search query, and filter mode are all part of the key
    // on purpose: any of them changing forces the same page number to
    // recompute and redraw, even though pagination itself didn't change.
    // Redrawing is cheap - the expensive sprite decode is cached separately
    // in cachedFlatSpriteIndex.
    const pickerKey = `uikit-sprite-gallery:${page}:${getSpriteNamesVersion()}:${filterMode}:${gallerySearchQuery}`;
    if (sourceWidget.__uikitPickerKey === pickerKey) return;
    const content = widgetManager.getWidgetByUid(uid(ComponentIds.CONTENT_VIEW));
    if (content) {
        content.scrollY = 0;
        // This is a fixed page, not another long list: every cell is laid
        // out inside the viewport and navigation owns changing pages.
        content.scrollHeight = content.height;
        widgetManager.invalidateScroll(content);
    }

    if (!cachedFlatSpriteIndex) {
        let spriteIndex: any;
        try {
            spriteIndex = widgetManager.osrsClient?.cacheSystem?.getIndex?.(IndexType.DAT2.sprites);
        } catch {
            spriteIndex = undefined;
        }
        if (!spriteIndex) return;
        cachedFlatSpriteIndex = buildFlatSpriteIndex(spriteIndex);
    }

    // 7500 simple string checks is well under a millisecond - no separate
    // cache needed beyond the flat index itself.
    const filtered = cachedFlatSpriteIndex.filter((entry) =>
        matchesGalleryFilter(entry, filterMode, gallerySearchQuery),
    );
    const firstCell = page * ComponentIds.MAX_SPRITE_GALLERY_CELLS;
    const entries = filtered.slice(firstCell, firstCell + ComponentIds.MAX_SPRITE_GALLERY_CELLS);

    for (let index = 0; index < ComponentIds.MAX_SPRITE_GALLERY_CELLS; index++) {
        const preview = widgetManager.getWidgetByUid(uid(ComponentIds.SPRITE_GALLERY_CELL_BASE + index));
        const label = widgetManager.getWidgetByUid(uid(ComponentIds.SPRITE_GALLERY_LABEL_BASE + index));
        const entry = entries[index];
        if (!preview || !label) continue;
        if (!entry) {
            preview.hidden = preview.isHidden = true;
            label.hidden = label.isHidden = true;
            continue;
        }
        preview.hidden = preview.isHidden = false;
        preview.type = 5;
        preview.isIf3 = true;
        preview.itemId = -1;
        preview.spriteId = -1;
        preview.spriteId2 = -1;
        preview.cacheSpriteToken = undefined;
        preview.cacheSpriteArchiveId = entry.archiveId;
        preview.cacheSpriteFrame = entry.frame;
        const maxWidth = Math.max(1, preview.__uikitGalleryMaxWidth ?? preview.width ?? 42);
        const maxHeight = Math.max(1, preview.__uikitGalleryMaxHeight ?? preview.height ?? 42);
        const spriteWidth = Math.max(1, entry.width);
        const spriteHeight = Math.max(1, entry.height);
        const scale = Math.min(maxWidth / spriteWidth, maxHeight / spriteHeight);
        const previewWidth = Math.max(1, Math.round(spriteWidth * scale));
        const previewHeight = Math.max(1, Math.round(spriteHeight * scale));
        const centerX = preview.__uikitGalleryCenterX ?? preview.rawX + Math.floor(maxWidth / 2);
        const topY = preview.__uikitGalleryTopY ?? preview.rawY;
        preview.rawX = centerX - Math.floor(previewWidth / 2);
        preview.rawY = topY + Math.floor((maxHeight - previewHeight) / 2);
        preview.rawWidth = preview.width = previewWidth;
        preview.rawHeight = preview.height = previewHeight;
        preview.opacity = 0;
        preview.transparency = 0;
        // Shows the assigned common name once one exists (see
        // client/public/spriteNames.json / ::Rename); otherwise falls
        // back to the raw "archiveId:frame" reference so unnamed sprites
        // stay identifiable and pasteable straight into ::Rename.
        label.text = formatSpriteGalleryLabel(entry.archiveId, entry.frame);
        label.hidden = label.isHidden = false;
        widgetManager.invalidateWidgetRender(preview);
        widgetManager.invalidateWidgetRender(label);
    }
    sourceWidget.__uikitPickerKey = pickerKey;
}

function cacheComponentPicker(widgetManager: any): void {
    const uid = (componentId: number) =>
        ((DEV_UIKIT_COMPONENT_PICKER_GROUP_ID & 0xffff) << 16) | componentId;
    const sourceWidget = widgetManager.getWidgetByUid(uid(ComponentIds.PICKER_SOURCE));
    const sourceToken = String(sourceWidget?.text ?? "").trim();
    const sourceGroupId = Number.parseInt(sourceToken, 10);
    if (!Number.isInteger(sourceGroupId) || sourceGroupId < 0) return;
    const pickerKey = `uikit-picker:${sourceGroupId}`;
    if (sourceWidget.__uikitPickerKey === pickerKey) return;
    const content = widgetManager.getWidgetByUid(uid(ComponentIds.CONTENT_VIEW));
    if (content) {
        content.scrollY = 0;
        widgetManager.invalidateScroll(content);
    }

    let sourceWidgets = widgetManager.getWidgetsForGroup(sourceGroupId);
    if (sourceWidgets.length === 0) {
        widgetManager.loadGroup(sourceGroupId);
        sourceWidgets = widgetManager.getWidgetsForGroup(sourceGroupId);
    }
    // The old inspector placed every layout container in the same list as
    // images. Containers (type 0) deliberately have nothing to render, so an
    // asset browser should show only real sprites and previewable models.
    sourceWidgets = sourceWidgets
        .filter((source: any) => {
            const type = source.type ?? 0;
            const hasSprite = (source.spriteId ?? -1) >= 0 || (source.spriteId2 ?? -1) >= 0;
            return (type === 5 && hasSprite) || type === 6;
        })
        .sort((a: any, b: any) => (a.fileId ?? 0) - (b.fileId ?? 0));

    for (let index = 0; index < ComponentIds.MAX_PICKER_ROWS; index++) {
        const preview = widgetManager.getWidgetByUid(uid(ComponentIds.PICKER_ROW_PREVIEW_BASE + index));
        const alternatePreview = widgetManager.getWidgetByUid(
            uid(ComponentIds.PICKER_ROW_ALT_PREVIEW_BASE + index),
        );
        const label = widgetManager.getWidgetByUid(uid(ComponentIds.PICKER_ROW_LABEL_BASE + index));
        const source = sourceWidgets[index];
        if (!preview || !alternatePreview || !label) continue;
        if (!source) {
            preview.hidden = preview.isHidden = true;
            alternatePreview.hidden = alternatePreview.isHidden = true;
            label.hidden = label.isHidden = true;
            continue;
        }
        const spriteId = typeof source.spriteId === "number" ? source.spriteId : -1;
        const alternateSpriteId = typeof source.spriteId2 === "number" ? source.spriteId2 : -1;
        const sourceType = source.type ?? 0;
        const modelId = typeof source.modelId === "number" ? source.modelId : -1;
        const sourceText = String(source.text ?? "").replace(/<[^>]+>/g, "").trim();
        label.text = `[${sourceGroupId}:${source.fileId}] ref ${cacheWidgetComponentKey(sourceGroupId, source.fileId)}` +
            ` | type ${sourceType} | sprite ${spriteId}` +
            (alternateSpriteId >= 0 ? ` / alt ${alternateSpriteId}` : "") +
            (modelId >= 0 ? ` | model ${modelId}` : "") +
            (spriteId >= 0 ? ` | key ${cacheWidgetAssetKey(sourceGroupId, source.fileId)}` : "") +
            (alternateSpriteId >= 0
                ? ` / ${cacheWidgetAssetKey(sourceGroupId, source.fileId, "alternate")}`
                : "") +
            (sourceText ? ` | ${sourceText.slice(0, 48)}` : "");
        label.hidden = label.isHidden = false;
        preview.hidden = preview.isHidden = sourceType !== 5 && sourceType !== 6 && spriteId < 0;
        preview.type = sourceType === 6 ? 6 : 5;
        // Keep both cache sprite fields visible. IF1 components may use
        // spriteId2 as their active/hover image, so one preview is not enough.
        preview.isIf3 = true;
        preview.spriteId = spriteId;
        preview.spriteId2 = -1;
        preview.cacheSpriteToken = undefined;
        preview.cacheSpriteArchiveId = undefined;
        preview.cacheSpriteFrame = undefined;
        preview.opacity = 0;
        preview.transparency = 0;
        preview.borderType = source.borderType;
        preview.graphicShadow = source.graphicShadow;
        preview.flippedH = source.flippedH ?? source.horizontalFlip;
        preview.flippedV = source.flippedV ?? source.verticalFlip;
        preview.itemId = typeof source.itemId === "number" ? source.itemId : -1;
        preview.itemQuantity = source.itemQuantity ?? 1;
        alternatePreview.hidden = alternatePreview.isHidden = alternateSpriteId < 0;
        alternatePreview.isIf3 = true;
        alternatePreview.type = 5;
        alternatePreview.spriteId = alternateSpriteId;
        alternatePreview.spriteId2 = -1;
        alternatePreview.cacheSpriteToken = undefined;
        alternatePreview.cacheSpriteArchiveId = undefined;
        alternatePreview.cacheSpriteFrame = undefined;
        alternatePreview.itemId = -1;
        alternatePreview.itemQuantity = 1;
        alternatePreview.opacity = 0;
        alternatePreview.transparency = 0;
        alternatePreview.borderType = source.borderType;
        alternatePreview.graphicShadow = source.graphicShadow;
        if (sourceType === 6) {
            Object.assign(preview, {
                modelId: source.modelId, modelType: source.modelType, modelZoom: source.modelZoom,
                modelOffsetX: source.modelOffsetX, modelOffsetY: source.modelOffsetY,
                rotationX: source.rotationX, rotationY: source.rotationY, rotationZ: source.rotationZ,
                modelOrthog: source.modelOrthog,
            });
        }
        widgetManager.invalidateWidgetRender(preview);
        widgetManager.invalidateWidgetRender(alternatePreview);
        widgetManager.invalidateWidgetRender(label);
    }
    sourceWidget.__uikitPickerKey = pickerKey;
}

function filterDevTextRows(query: string, widgetManager: any): void {
    const normalizedQuery = query.trim().toLowerCase();
    const uid = (componentId: number) =>
        ((DEV_UIKIT_TEXT_PANEL_GROUP_ID & 0xffff) << 16) | componentId;
    let visibleRowIndex = 0;
    for (let index = 0; index < ComponentIds.MAX_ROWS; index++) {
        const line = widgetManager.getWidgetByUid(uid(ComponentIds.TEXT_ROW_LINE_BASE + index));
        const centered = widgetManager.getWidgetByUid(uid(ComponentIds.TEXT_ROW_CENTER_BASE + index));
        const divider = widgetManager.getWidgetByUid(uid(ComponentIds.TEXT_ROW_DIVIDER_BASE + index));
        const text = `${line?.text ?? ""} ${centered?.text ?? ""}`
            .replace(/<[^>]+>/g, "")
            .toLowerCase();
        const matches = !normalizedQuery || text.includes(normalizedQuery);
        for (const widget of [line, centered]) {
            if (!widget) continue;
            if (widget.__uikitBaseHidden === undefined) widget.__uikitBaseHidden = !!widget.hidden;
            widget.hidden = widget.__uikitBaseHidden || !matches;
            widget.isHidden = widget.hidden;
            if (widget.__uikitBaseRawY === undefined) widget.__uikitBaseRawY = widget.rawY;
            widget.rawY = matches ? visibleRowIndex * TEXT_ROW_HEIGHT : widget.__uikitBaseRawY;
            widget.y = widget.rawY;
            widgetManager.invalidateWidgetRender(widget);
        }
        if (divider) {
            if (divider.__uikitBaseHidden === undefined) divider.__uikitBaseHidden = !!divider.hidden;
            divider.hidden = divider.__uikitBaseHidden || !matches;
            divider.isHidden = divider.hidden;
            if (divider.__uikitBaseRawY === undefined) divider.__uikitBaseRawY = divider.rawY;
            divider.rawY = matches
                ? visibleRowIndex * TEXT_ROW_HEIGHT + Math.floor(TEXT_ROW_HEIGHT / 2) - 1
                : divider.__uikitBaseRawY;
            divider.y = divider.rawY;
            widgetManager.invalidateWidgetRender(divider);
        }
        if ([line, centered, divider].some((widget) => widget && !widget.hidden)) {
            visibleRowIndex++;
        }
    }
    const content = widgetManager.getWidgetByUid(uid(ComponentIds.CONTENT_VIEW));
    if (content) {
        content.scrollY = 0;
        content.scrollHeight = Math.max(content.height, visibleRowIndex * TEXT_ROW_HEIGHT);
        widgetManager.invalidateScroll(content);
    }
}

// This temporary developer-only panel deliberately exercises the complete
// UIKit surface. Text/icon rows and footer/controls are alternative layouts,
// so they are shown on two screens navigated from the same ::Dev entry point.
registerUiPanel({
    groupId: DEV_UIKIT_TEXT_PANEL_GROUP_ID,
    build: () => buildUiPanel(DEV_UIKIT_TEXT_PANEL_GROUP_ID, {
        width: 560,
        height: 360,
        tabs: { position: "left", width: 124 },
        content: { rowKind: "text", rowHeight: TEXT_ROW_HEIGHT, scrollbarWidth: 16 },
        controls: { width: 108, height: 20, gap: 8 },
        search: { placeholder: "Search is a local UIKit input", width: 180 },
    }),
    scrollController: createScrollController(
        DEV_UIKIT_TEXT_PANEL_GROUP_ID,
        "text",
        TEXT_ROW_HEIGHT,
    ),
    searchController: createSearchController(
        DEV_UIKIT_TEXT_PANEL_GROUP_ID,
        "Search is a local UIKit input",
        filterDevTextRows,
    ),
});

registerUiPanel({
    groupId: DEV_UIKIT_MENU_PANEL_GROUP_ID,
    build: () => buildUiPanel(DEV_UIKIT_MENU_PANEL_GROUP_ID, {
        width: 560,
        height: 390,
        content: { rowKind: "mixed", rowHeight: 34, scrollbarWidth: 0 },
        menuButtons: {
            // maxHeightFraction was 0.375 here vs 0.78 on the components
            // page below - same button grid code, but this one was only
            // ever allowed to use ~38% of the available height, which is
            // why it rendered noticeably smaller. Matched to the working
            // reference. Default background now points at the raw sprite
            // (293:0) directly - once you've named it via ::Rename, swap
            // this string for that name; the raw "cache.sprite.293.0" key
            // keeps working either way.
            columns: 2, rows: 4, buttonHeight: 58, gap: 8, iconSize: 40,
            maxHeightFraction: 0.78, maxWidthFraction: 0.75,
            backgroundAsset: "cache.sprite.293.0",
            backgroundHoverAsset: "cache.sprite.294.0",
        },
        footerButton: true,
    }),
});

// This launcher deliberately opens cache-defined interfaces rather than copying
// their assets. It lets developers inspect their real component hierarchy and
// choose an exact source component for a later UIKit skin.
registerUiPanel({
    groupId: DEV_UIKIT_COMPONENTS_PANEL_GROUP_ID,
    build: () => buildUiPanel(DEV_UIKIT_COMPONENTS_PANEL_GROUP_ID, {
        width: 560,
        height: 390,
        content: { rowKind: "mixed", rowHeight: 34, scrollbarWidth: 0 },
        menuButtons: {
            columns: 2, rows: 4, buttonHeight: 58, gap: 10, iconSize: 36,
            maxHeightFraction: 0.78, maxWidthFraction: 0.75,
        },
        footerButton: true,
    }),
});

registerUiPanel({
    groupId: DEV_UIKIT_COMPONENT_PICKER_GROUP_ID,
    build: () => buildUiPanel(DEV_UIKIT_COMPONENT_PICKER_GROUP_ID, {
        width: 640,
        height: 440,
        plainFrame: true,
        content: { rowKind: "picker", rowHeight: 32, rowCapacity: ComponentIds.MAX_PICKER_ROWS, scrollbarWidth: 16 },
        footerButton: true,
    }),
    scrollController: createScrollController(
        DEV_UIKIT_COMPONENT_PICKER_GROUP_ID,
        "picker",
        32,
        ComponentIds.MAX_PICKER_ROWS,
    ),
    onProcess: cacheComponentPicker,
});

registerUiPanel({
    groupId: DEV_UIKIT_SPRITE_GALLERY_GROUP_ID,
    // Mounted via openModal into the real client's mainmodal container.
    // 720x570, then 640x440, both still overflowed it - the "component
    // picker works at 640x440" assumption behind the second attempt was
    // wrong; it was very likely overflowing too, just less obviously.
    // buildUiPanel now clamps every panel to a safe 512x334 centrally (see
    // PanelBuilder.ts), so the width/height requested here no longer needs
    // to be exactly right - this is left at 640x440 as the "ideal" size and
    // relies on the shared clamp, rather than hand-tuning per panel again.
    build: () => buildUiPanel(DEV_UIKIT_SPRITE_GALLERY_GROUP_ID, {
        width: 640,
        height: 440,
        plainFrame: true,
        content: {
            rowKind: "sprite-gallery",
            rowHeight: 58,
            rowCapacity: ComponentIds.MAX_SPRITE_GALLERY_CELLS,
            scrollbarWidth: 0,
        },
        // 4th control is the named/unnamed/skipped filter toggle - see
        // devUIKitMenu.ts's cycleSpriteGalleryFilter. Width auto-clamps to
        // whatever actually fits (see PanelBuilder.ts's maxControlWidth),
        // so bumping count from 3 to 4 needed no other change here.
        controls: { count: 4, width: 146, height: 20, gap: 10 },
        search: { placeholder: "Search name or archiveId:frame", width: 220 },
    }),
    searchController: createSearchController(
        DEV_UIKIT_SPRITE_GALLERY_GROUP_ID,
        "Search name or archiveId:frame",
        filterSpriteGallery,
    ),
    onProcess: cacheSpriteGallery,
});

registerUiPanel({
    groupId: DEV_UIKIT_ICON_PANEL_GROUP_ID,
    build: () => buildUiPanel(DEV_UIKIT_ICON_PANEL_GROUP_ID, {
        width: 560,
        height: 360,
        tabs: { position: "top", height: 22 },
        content: { rowKind: "icon", rowHeight: ICON_ROW_HEIGHT, scrollbarWidth: 16 },
        footerButton: true,
    }),
    scrollController: createScrollController(
        DEV_UIKIT_ICON_PANEL_GROUP_ID,
        "icon",
        ICON_ROW_HEIGHT,
    ),
});
