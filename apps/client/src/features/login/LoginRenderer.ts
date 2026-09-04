import { isMobileMode, isTouchDevice } from "@client/core/platform/device/DeviceUtil";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { GameState } from "@client/features/login/GameState";
import { LoginAction } from "@client/features/login/LoginAction";
import type { LoginState } from "@client/features/login/LoginState";
import { LOGIN_LAYOUT } from "@client/features/login/renderer/constants";
import { FALLBACK_SERVERS } from "@client/features/login/renderer/constants";
import type { LoginRendererHost } from "@client/features/login/renderer/host";
import type { LoginLayoutConfig, ServerListEntry, World } from "@client/features/login/renderer/types";
import * as assets from "@client/features/login/renderer/assets";
import * as canvas from "@client/features/login/renderer/canvas";
import * as controls from "@client/features/login/renderer/controls";
import * as hover from "@client/features/login/renderer/hover";
import * as lifecycle from "@client/features/login/renderer/lifecycle";
import * as serverList from "@client/features/login/renderer/serverList";
import * as layoutConfig from "@client/features/login/renderer/layout/config";
import * as layoutGeometry from "@client/features/login/renderer/layout/geometry";
import { updateLayout } from "@client/features/login/renderer/layout/updateLayout";
import * as inputKeyboard from "@client/features/login/renderer/input/keyboard";
import * as inputMouse from "@client/features/login/renderer/input/mouseClick";
import * as sceneEntry from "@client/features/login/renderer/render/sceneEntry";
import * as titleScene from "@client/features/login/renderer/render/titleScene";
import { getMobileWorldIndexAtPosition } from "@client/features/login/renderer/world/worldSelectMobile";
import type {
    CanvasSurface,
    CanvasSurfaceContext,
} from "@client/core/platform/browser/CanvasSurface";

export type { LoginLayoutConfig, ServerListEntry, World } from "@client/features/login/renderer/types";
export { WorldFlags } from "@client/features/login/renderer/types";

/**
 * Login screen renderer facade.
 * Delegates to modules under ./renderer/ while preserving the public API.
 */
export class LoginRenderer implements LoginRendererHost {
    readonly LOGIN_BOX_X = LOGIN_LAYOUT.LOGIN_BOX_X;
    readonly LOGIN_BOX_CENTER = LOGIN_LAYOUT.LOGIN_BOX_CENTER;
    readonly TITLEBOX_Y = LOGIN_LAYOUT.TITLEBOX_Y;
    readonly TITLEBOX_FALLBACK_WIDTH = LOGIN_LAYOUT.TITLEBOX_FALLBACK_WIDTH;
    readonly TITLEBOX_FALLBACK_HEIGHT = LOGIN_LAYOUT.TITLEBOX_FALLBACK_HEIGHT;
    readonly BOTTOM_CONTROLS_RESERVE = LOGIN_LAYOUT.BOTTOM_CONTROLS_RESERVE;
    readonly CONTENT_WIDTH = LOGIN_LAYOUT.CONTENT_WIDTH;
    readonly SCENE_WIDTH = LOGIN_LAYOUT.SCENE_WIDTH;
    readonly SCENE_HEIGHT = LOGIN_LAYOUT.SCENE_HEIGHT;

    titleboxY: number = this.TITLEBOX_Y;
    contentOriginY = 0;
    contentOriginX = 0;
    contentScale = 1;
    containerX = 0;
    containerWidth = LOGIN_LAYOUT.MAX_BG_WIDTH;
    containerHeight = LOGIN_LAYOUT.MAX_BG_HEIGHT;
    xPadding = 0;
    canvasWidth = this.SCENE_WIDTH;
    canvasHeight = this.SCENE_HEIGHT;
    renderScale = 1;
    renderOffsetX = 0;
    renderOffsetY = 0;
    renderSurfaceWidth = this.SCENE_WIDTH;
    mobileKeyboardFocusActive = false;
    mobileKeyboardFocusField = 0;
    loginBoxX = 202;
    loginBoxCenter = 382;

    titleBackgroundImage: ImageBitmap | HTMLImageElement | undefined;
    logoSprite: import("@august/osrs-engine/sprite/IndexedSprite").IndexedSprite | undefined;
    logoImage: HTMLImageElement | undefined;
    logoImageLoaded = false;
    titleboxSprite: import("@august/osrs-engine/sprite/IndexedSprite").IndexedSprite | undefined;
    titlebuttonSprite: import("@august/osrs-engine/sprite/IndexedSprite").IndexedSprite | undefined;
    titlebuttonLargeSprite: import("@august/osrs-engine/sprite/IndexedSprite").IndexedSprite | undefined;
    playNowTextSprite: import("@august/osrs-engine/sprite/IndexedSprite").IndexedSprite | undefined;
    runesSprites: import("@august/osrs-engine/sprite/IndexedSprite").IndexedSprite[] | undefined;
    titleMuteSprites: import("@august/osrs-engine/sprite/IndexedSprite").IndexedSprite[] | undefined;
    optionsRadioSprite0: import("@august/osrs-engine/sprite/IndexedSprite").IndexedSprite | undefined;
    optionsRadioSprite2: import("@august/osrs-engine/sprite/IndexedSprite").IndexedSprite | undefined;
    optionsRadioSprite4: import("@august/osrs-engine/sprite/IndexedSprite").IndexedSprite | undefined;
    optionsRadioSprite6: import("@august/osrs-engine/sprite/IndexedSprite").IndexedSprite | undefined;
    worldSelectLeftSprite: import("@august/osrs-engine/sprite/IndexedSprite").IndexedSprite | undefined;
    worldSelectRightSprite: import("@august/osrs-engine/sprite/IndexedSprite").IndexedSprite | undefined;
    worldSelectButtonSprite: import("@august/osrs-engine/sprite/IndexedSprite").IndexedSprite | undefined;
    worldSelectBackSprites: import("@august/osrs-engine/sprite/IndexedSprite").IndexedSprite[] | undefined;
    worldSelectFlagSprites: import("@august/osrs-engine/sprite/IndexedSprite").IndexedSprite[] | undefined;
    worldSelectStarSprites: import("@august/osrs-engine/sprite/IndexedSprite").IndexedSprite[] | undefined;
    worldSelectArrowSprites: import("@august/osrs-engine/sprite/IndexedSprite").IndexedSprite[] | undefined;

    fontBold12: import("@august/osrs-engine/font/BitmapFont").BitmapFont | undefined;
    fontPlain11: import("@august/osrs-engine/font/BitmapFont").BitmapFont | undefined;
    fontPlain12: import("@august/osrs-engine/font/BitmapFont").BitmapFont | undefined;

    cycle = 0;
    lastTickTime = 0;
    caretBlinkMs = 0;
    mouseX = 0;
    mouseY = 0;
    serverList: ServerListEntry[] = [...FALLBACK_SERVERS];
    serverListFetched = false;
    probing = false;
    probed = false;
    worldSortOption = 0;
    worldSortDirection = 0;
    currentSortedWorlds: World[] = [];
    cachedSortedWorlds: World[] | null = null;
    cachedSortOption = -1;
    cachedSortDirection = -1;
    loginScreenRunesAnimation: import("@client/features/login/LoginScreenAnimation").LoginScreenAnimation | undefined;
    lifecycleAbortController = new AbortController();

    canvas: HTMLCanvasElement | undefined;
    ctx: CanvasRenderingContext2D | undefined;
    spriteCache = new WeakMap<
        import("@august/osrs-engine/sprite/IndexedSprite").IndexedSprite,
        CanvasSurface
    >();
    textMeasureCache = new WeakMap<import("@august/osrs-engine/font/BitmapFont").BitmapFont, Map<string, number>>();

    worldSelectCache: CanvasSurface | null = null;
    worldSelectCacheCtx: CanvasSurfaceContext | null = null;
    worldSelectCachePage = -1;
    worldSelectCacheSortOption = -1;
    worldSelectCacheSortDirection = -1;
    worldSelectCacheWidth = 0;
    worldSelectCacheHeight = 0;

    titleCache: CanvasSurface | null = null;
    titleCacheCtx: CanvasSurfaceContext | null = null;
    titleCacheStateHash = "";
    titleCacheWidth = 0;
    titleCacheHeight = 0;

    layoutConfig: LoginLayoutConfig = {
        scale: 1,
        isMobile: isMobileMode,
        isTouch: isTouchDevice,
        minTouchTarget: 44,
        worldSelectListMode: false,
        orientation: "landscape",
        viewportWidth: 765,
        viewportHeight: 503,
    };
    scaledLoginBoxX = 202;
    scaledLoginBoxCenter = 382;
    cachedGridLayout = null;
    cachedGridWorldCount = -1;

    constructor() {
        canvas.initCanvas(this);
    }

    async fetchServerList(): Promise<void> {
        return serverList.fetchServerList(this);
    }
    refreshServerList(): void {
        serverList.refreshServerList(this);
    }
    computeLayoutConfig(w: number, h: number): LoginLayoutConfig {
        return layoutConfig.computeLayoutConfig(this, w, h);
    }
    getLayoutConfig(): LoginLayoutConfig {
        return layoutConfig.getLayoutConfig(this);
    }
    getRenderScale(): number {
        return layoutConfig.getRenderScale(this);
    }
    getTitleAssetStateHash(): string {
        return layoutConfig.getTitleAssetStateHash(this);
    }
    syncMobileViewportState(state: LoginState, keyboardFocused = false): void {
        layoutConfig.syncMobileViewportState(this, state, keyboardFocused);
    }
    getViewportTransformStateHash(): string {
        return layoutConfig.getViewportTransformStateHash(this);
    }
    getCanvas(width: number, height: number): HTMLCanvasElement {
        return canvas.getCanvas(this, width, height);
    }
    getContext(): CanvasRenderingContext2D | undefined {
        return canvas.getContext(this);
    }
    tick(): void {
        canvas.tick(this);
    }
    getFireAnimation() {
        return canvas.getFireAnimation(this);
    }
    getFirePositions() {
        return canvas.getFirePositions(this);
    }
    computeHoveredWorldIndex(state: LoginState, w: number, h: number): number {
        return hover.computeHoveredWorldIndex(this, state, w, h);
    }
    computeHoveredServerIndex(state: LoginState): number {
        return hover.computeHoveredServerIndex(this, state);
    }
    setMousePosition(x: number, y: number): void {
        hover.setMousePosition(this, x, y);
    }
    updateLayout(
        canvasWidth: number,
        canvasHeight: number,
        surfaceWidth?: number,
        surfaceHeight?: number,
    ): void {
        updateLayout(this, canvasWidth, canvasHeight, surfaceWidth, surfaceHeight);
    }
    mapPointerToContent(layoutX: number, layoutY: number) {
        return layoutGeometry.mapPointerToContent(this, layoutX, layoutY);
    }
    loadLogoImage(): Promise<boolean> {
        return assets.loadLogoImage(this);
    }
    loadTitleBackground(): Promise<boolean> {
        return assets.loadTitleBackground(this);
    }
    loadTitleSprites(cache: CacheSystem): boolean {
        return assets.loadTitleSprites(this, cache);
    }
    loadFonts(cache: CacheSystem): boolean {
        return assets.loadFonts(this, cache);
    }
    handleKeyInput(state: LoginState, key: string, char: string): boolean {
        return inputKeyboard.handleKeyInput(this, state, key, char);
    }
    handleMouseClick(
        state: LoginState,
        x: number,
        y: number,
        button: number,
        gameState: GameState = GameState.LOGIN_SCREEN,
    ): LoginAction | undefined {
        return inputMouse.handleMouseClick(this, state, x, y, button, gameState);
    }
    drawDownload(
        state: LoginState,
        width: number,
        height: number,
        layoutWidth?: number,
        layoutHeight?: number,
    ): void {
        sceneEntry.drawDownload(this, state, width, height, layoutWidth, layoutHeight);
    }
    drawInitial(
        state: LoginState,
        width: number,
        height: number,
        layoutWidth?: number,
        layoutHeight?: number,
    ): void {
        sceneEntry.drawInitial(this, state, width, height, layoutWidth, layoutHeight);
    }
    drawTitle(
        state: LoginState,
        gameState: GameState,
        width: number,
        height: number,
        skipFire?: boolean,
        hoverOnly?: boolean,
        layoutWidth?: number,
        layoutHeight?: number,
    ): void {
        titleScene.drawTitle(
            this,
            state,
            gameState,
            width,
            height,
            skipFire,
            hoverOnly,
            layoutWidth,
            layoutHeight,
        );
    }
    getMobileWorldIndexAtPosition(
        state: LoginState,
        x: number,
        y: number,
        width: number,
        height: number,
    ): number {
        return getMobileWorldIndexAtPosition(this, state, x, y, width, height);
    }
    dispose(): void {
        lifecycle.dispose(this);
    }
    resetAnimationState(): void {
        lifecycle.resetAnimationState(this);
    }
}
