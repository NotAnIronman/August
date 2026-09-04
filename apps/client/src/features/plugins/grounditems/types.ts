import type { ClientGroundItemStack } from "@client/engine/game/data/ground/GroundItemStore";

export type GroundItemsPriceDisplayMode = "ha" | "ge" | "both" | "off";
export type GroundItemsValueCalculationMode = "ha" | "ge" | "highest";
export type GroundItemsOwnershipFilterMode = "all" | "takeable" | "drops";
export type GroundItemsDespawnTimerMode = "off" | "ticks" | "seconds";
export type GroundItemsItemHighlightMode = "both" | "overlay" | "menu" | "none";
export type GroundItemsMenuHighlightMode = "name" | "option" | "both";
export type GroundItemsMenuSortMode = "off" | "value" | "name";
export type GroundItemsLootBeamStyle = "modern" | "light";
export type GroundItemsValueTier = "none" | "low" | "medium" | "high" | "insane";
export type GroundItemsNotificationTier = "off" | Exclude<GroundItemsValueTier, "none">;

export interface GroundItemRuleDiagnostic {
    line: number;
    source: string;
    message: string;
}

export interface GroundItemMatchedRule {
    line: number;
    action: "apply" | "hide" | "show" | "highlight" | "beam";
}

export interface GroundItemsTimingContext {
    currentTick: number;
    tickPhase?: number;
    tickMs?: number;
}

export interface GroundItemsPluginConfig {
    enabled: boolean;
    highlightedItems: string;
    hiddenItems: string;
    showHighlightedOnly: boolean;
    rightClickHidden: boolean;
    recolorMenuHiddenItems: boolean;
    showMenuItemQuantities: boolean;
    dontHideUntradeables: boolean;
    hideUnderValue: number;
    priceDisplayMode: GroundItemsPriceDisplayMode;
    valueCalculationMode: GroundItemsValueCalculationMode;
    defaultColor: number;
    highlightedColor: number;
    hiddenColor: number;
    lowValueColor: number;
    lowValuePrice: number;
    mediumValueColor: number;
    mediumValuePrice: number;
    highValueColor: number;
    highValuePrice: number;
    insaneValueColor: number;
    insaneValuePrice: number;
    ownershipFilterMode: GroundItemsOwnershipFilterMode;
    despawnTimerMode: GroundItemsDespawnTimerMode;
    /** Selects which surfaces receive category/value-tier colors. */
    itemHighlightMode: GroundItemsItemHighlightMode;
    /** Selects which part of a ground-item menu entry receives its color. */
    menuHighlightMode: GroundItemsMenuHighlightMode;
    highlightTiles: boolean;
    /** Tile fill opacity, normalized to the inclusive range 0..1. */
    tileHighlightFillAlpha: number;
    textOutline: boolean;
    collapseGroundItemMenu: boolean;
    menuSortMode: GroundItemsMenuSortMode;
    lootBeamEnabled: boolean;
    lootBeamForHighlightedItems: boolean;
    lootBeamStyle: GroundItemsLootBeamStyle;
    lootBeamMinimumTier: Exclude<GroundItemsValueTier, "none">;
    /** Maximum interval between Alt presses that toggles overlay visibility. Zero disables. */
    doubleTapDelayMs: number;
    notifyHighlightedDrops: boolean;
    notifyMinimumTier: GroundItemsNotificationTier;
    /** Optional, local-only filter program. One pipe-delimited rule per line. */
    advancedFilterRules: string;
}

export interface GroundItemsPluginState {
    config: GroundItemsPluginConfig;
    version: number;
    ruleDiagnostics: readonly GroundItemRuleDiagnostic[];
}

export interface GroundItemsPluginPersistence {
    load(): Partial<GroundItemsPluginConfig> | undefined;
    save(config: GroundItemsPluginConfig): void;
}

export interface GroundItemEvaluation {
    stack: ClientGroundItemStack;
    label: string;
    baseLabel: string;
    timerLabel?: string;
    timerColor?: number;
    color: number;
    hidden: boolean;
    highlighted: boolean;
    explicitHighlight: boolean;
    tier: GroundItemsValueTier;
    showOverlay: boolean;
    showMenu: boolean;
    /** Undefined means use normal loot-beam policy; boolean is a rule override. */
    beam?: boolean;
    tileHighlight: boolean;
    menuPriority: number;
    matchedRules: readonly GroundItemMatchedRule[];
    terminalRule?: GroundItemMatchedRule;
}
