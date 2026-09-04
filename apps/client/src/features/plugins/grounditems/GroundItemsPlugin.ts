import type { ClientGroundItemStack } from "@client/engine/game/data/ground/GroundItemStore";
import type {
    GroundItemEvaluation,
    GroundItemRuleDiagnostic,
    GroundItemsDespawnTimerMode,
    GroundItemsItemHighlightMode,
    GroundItemsLootBeamStyle,
    GroundItemsMenuHighlightMode,
    GroundItemsMenuSortMode,
    GroundItemsNotificationTier,
    GroundItemsOwnershipFilterMode,
    GroundItemsPluginConfig,
    GroundItemsPluginPersistence,
    GroundItemsPluginState,
    GroundItemsTimingContext,
    GroundItemsValueTier,
    GroundItemsValueCalculationMode,
} from "@client/features/plugins/grounditems/types";
import {
    compileGroundItemRules,
    evaluateGroundItemRules,
    type CompiledGroundItemRules,
} from "@client/features/plugins/grounditems/GroundItemRuleEngine";

type GroundItemsListener = () => void;

type QuantityMatchOp = "lt" | "gt";

type CompiledPattern = {
    regex?: RegExp;
    exact?: string;
    wildcard: boolean;
    quantityOp?: QuantityMatchOp;
    quantityValue?: number;
};

const DEFAULT_CONFIG: GroundItemsPluginConfig = Object.freeze({
    enabled: true,
    highlightedItems: "",
    hiddenItems: "Vial, Ashes, Coins, Bones, Bucket, Jug, Seaweed",
    showHighlightedOnly: false,
    rightClickHidden: false,
    recolorMenuHiddenItems: false,
    showMenuItemQuantities: true,
    dontHideUntradeables: true,
    hideUnderValue: 0,
    priceDisplayMode: "both",
    valueCalculationMode: "highest",
    defaultColor: 0xffffff,
    highlightedColor: 0xaa00ff,
    hiddenColor: 0x808080,
    lowValueColor: 0x66b2ff,
    lowValuePrice: 20_000,
    mediumValueColor: 0x99ff99,
    mediumValuePrice: 100_000,
    highValueColor: 0xff9600,
    highValuePrice: 1_000_000,
    insaneValueColor: 0xff66b2,
    insaneValuePrice: 10_000_000,
    ownershipFilterMode: "all",
    despawnTimerMode: "off",
    itemHighlightMode: "both",
    menuHighlightMode: "name",
    highlightTiles: false,
    tileHighlightFillAlpha: 0.18,
    textOutline: true,
    collapseGroundItemMenu: false,
    menuSortMode: "off",
    lootBeamEnabled: true,
    lootBeamForHighlightedItems: true,
    lootBeamStyle: "modern",
    lootBeamMinimumTier: "high",
    doubleTapDelayMs: 250,
    notifyHighlightedDrops: false,
    notifyMinimumTier: "off",
    advancedFilterRules: "",
});

const COINS_ITEM_ID = 995;
const TILE_ITEM_OWNERSHIP_OTHER = 2;
const ACCOUNT_TYPE_MAIN = 0;
const TIMER_COLOR_PUBLIC = 0xffff00;
const TIMER_COLOR_PRIVATE = 0x00ff00;

function sanitizeNumber(value: unknown, fallback: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(0, Math.floor(numeric));
}

function sanitizeColor(value: unknown, fallback: number): number {
    const numeric = sanitizeNumber(value, fallback);
    return numeric & 0xffffff;
}

function sanitizeAlpha(value: unknown, fallback: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(0, Math.min(1, numeric));
}

function sanitizeMode(value: unknown, fallback: GroundItemsPluginConfig["priceDisplayMode"]) {
    if (value === "ha" || value === "ge" || value === "both" || value === "off") {
        return value;
    }
    return fallback;
}

function sanitizeValueMode(
    value: unknown,
    fallback: GroundItemsValueCalculationMode,
): GroundItemsValueCalculationMode {
    if (value === "ha" || value === "ge" || value === "highest") {
        return value;
    }
    return fallback;
}

function sanitizeOwnershipFilterMode(
    value: unknown,
    fallback: GroundItemsOwnershipFilterMode,
): GroundItemsOwnershipFilterMode {
    if (value === "all" || value === "takeable" || value === "drops") {
        return value;
    }
    return fallback;
}

function sanitizeDespawnTimerMode(
    value: unknown,
    fallback: GroundItemsDespawnTimerMode,
): GroundItemsDespawnTimerMode {
    if (value === "off" || value === "ticks" || value === "seconds") {
        return value;
    }
    return fallback;
}

function sanitizeItemHighlightMode(
    value: unknown,
    fallback: GroundItemsItemHighlightMode,
): GroundItemsItemHighlightMode {
    return value === "both" || value === "overlay" || value === "menu" || value === "none"
        ? value
        : fallback;
}

function sanitizeMenuHighlightMode(
    value: unknown,
    fallback: GroundItemsMenuHighlightMode,
): GroundItemsMenuHighlightMode {
    return value === "name" || value === "option" || value === "both" ? value : fallback;
}

function sanitizeMenuSortMode(
    value: unknown,
    fallback: GroundItemsMenuSortMode,
): GroundItemsMenuSortMode {
    return value === "off" || value === "value" || value === "name" ? value : fallback;
}

function sanitizeLootBeamStyle(
    value: unknown,
    fallback: GroundItemsLootBeamStyle,
): GroundItemsLootBeamStyle {
    return value === "modern" || value === "light" ? value : fallback;
}

function sanitizeTier(
    value: unknown,
    fallback: Exclude<GroundItemsValueTier, "none">,
): Exclude<GroundItemsValueTier, "none"> {
    return value === "low" || value === "medium" || value === "high" || value === "insane"
        ? value
        : fallback;
}

function sanitizeNotificationTier(
    value: unknown,
    fallback: GroundItemsNotificationTier,
): GroundItemsNotificationTier {
    return value === "off" ||
        value === "low" ||
        value === "medium" ||
        value === "high" ||
        value === "insane"
        ? value
        : fallback;
}

function normalizeName(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function escapeRegex(source: string): string {
    return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseListToken(rawToken: string): CompiledPattern | undefined {
    const token = rawToken.trim();
    if (token.length === 0) return undefined;

    let base = token;
    let quantityOp: QuantityMatchOp | undefined;
    let quantityValue: number | undefined;

    // RuneLite syntax supports quantity operators with highlighted/hidden list entries:
    // item_name>10, item_name<5
    const quantityMatch = /(.*?)([<>])\s*(\d+)$/.exec(token);
    if (quantityMatch) {
        const quantityBase = quantityMatch[1];
        base = (typeof quantityBase === "string" ? quantityBase : "").trim();
        quantityOp = quantityMatch[2] === "<" ? "lt" : "gt";
        quantityValue = Math.max(0, Number(quantityMatch[3]) | 0);
    }

    if (base.length === 0) return undefined;

    // Exact match syntax: "item_name"
    const quoted = /^"(.*)"$/.exec(base);
    if (quoted) {
        const quotedName = quoted[1];
        const exact = normalizeName(typeof quotedName === "string" ? quotedName : "");
        if (exact.length === 0) return undefined;
        return { exact, wildcard: false, quantityOp, quantityValue };
    }

    const normalized = normalizeName(base);
    if (normalized.length === 0) return undefined;
    if (!normalized.includes("*")) {
        return { exact: normalized, wildcard: false, quantityOp, quantityValue };
    }
    const escaped = escapeRegex(normalized).replace(/\\\*/g, ".*");
    return {
        regex: new RegExp(`^${escaped}$`, "i"),
        wildcard: true,
        quantityOp,
        quantityValue,
    };
}

function compileCsvList(raw: string): CompiledPattern[] {
    const entries = raw
        .split(/,|\n/)
        .map((part) => parseListToken(part))
        .filter((part): part is CompiledPattern => part !== undefined);
    const deduped = new Map<string, CompiledPattern>();
    for (const entry of entries) {
        const keyExact = entry.exact !== undefined ? entry.exact : entry.regex?.source || "";
        const keyQuantityOp = entry.quantityOp !== undefined ? entry.quantityOp : "";
        const keyQuantityValue = entry.quantityValue !== undefined ? entry.quantityValue : -1;
        const key = `${keyExact}|${keyQuantityOp}|${keyQuantityValue}`;
        deduped.set(key, entry);
    }
    return [...deduped.values()];
}

function formatWithCommas(value: number): string {
    const n = Math.max(0, Math.floor(value));
    return `${n}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function matchesQuantity(
    pattern: Pick<CompiledPattern, "quantityOp" | "quantityValue">,
    quantity: number,
): boolean {
    if (!pattern.quantityOp) return true;
    const threshold = Math.max(0, pattern.quantityValue !== undefined ? pattern.quantityValue : 0);
    if (pattern.quantityOp === "lt") return quantity < threshold;
    return quantity > threshold;
}

function formatCompact(value: number): string {
    const n = Math.max(0, Math.floor(value));
    if (n >= 1_000_000_000) {
        const scaled = n / 1_000_000_000;
        return `${scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1).replace(/\.0$/, "")}B`;
    }
    if (n >= 1_000_000) {
        const scaled = n / 1_000_000;
        return `${scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1).replace(/\.0$/, "")}M`;
    }
    if (n >= 1_000) {
        const scaled = n / 1_000;
        return `${scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1).replace(/\.0$/, "")}K`;
    }
    return `${n}`;
}

function valueByMode(
    geValue: number,
    haValue: number,
    mode: GroundItemsValueCalculationMode,
): number {
    if (mode === "ge") return geValue;
    if (mode === "ha") return haValue;
    return Math.max(geValue, haValue);
}

function buildLabel(stack: ClientGroundItemStack, config: GroundItemsPluginConfig): string {
    const qtyLabel =
        stack.quantity > 1 ? ` x ${formatCompact(Math.max(1, stack.quantity | 0))}` : "";
    const baseLabel = `${stack.name}${qtyLabel}`;
    if (config.priceDisplayMode === "off" || (stack.itemId | 0) === COINS_ITEM_ID) {
        return baseLabel;
    }

    const geTotal = Math.max(0, (stack.gePrice | 0) * Math.max(1, stack.quantity | 0));
    const haTotal = Math.max(0, (stack.haPrice | 0) * Math.max(1, stack.quantity | 0));

    if (config.priceDisplayMode === "both") {
        const suffix: string[] = [];
        if (geTotal > 0) suffix.push(`GE: ${formatCompact(geTotal)} gp`);
        if (haTotal > 0) suffix.push(`HA: ${formatCompact(haTotal)} gp`);
        return suffix.length > 0 ? `${baseLabel} (${suffix.join(", ")})` : baseLabel;
    }

    const value = config.priceDisplayMode === "ge" ? geTotal : haTotal;
    if (value <= 0) return baseLabel;
    return `${baseLabel} (${formatCompact(value)} gp)`;
}

function getTicksRemaining(
    stack: ClientGroundItemStack,
    timing: GroundItemsTimingContext | undefined,
): number | undefined {
    if (!timing) return undefined;
    const expiresTick = Number(stack.expiresTick);
    if (!Number.isFinite(expiresTick) || expiresTick <= 0) return undefined;

    const currentTick = Math.max(0, timing.currentTick | 0);
    const tickPhaseRaw = Number.isFinite(timing.tickPhase) ? (timing.tickPhase as number) : 0;
    const tickPhase = Math.max(0, Math.min(0.999, tickPhaseRaw));
    const ticksRemaining = expiresTick - currentTick - tickPhase;
    if (!(ticksRemaining > 0)) return undefined;
    return ticksRemaining;
}

function formatTimerSuffix(
    config: GroundItemsPluginConfig,
    ticksRemaining: number | undefined,
    timing: GroundItemsTimingContext | undefined,
): string {
    if (config.despawnTimerMode === "off") return "";
    if (
        !(
            typeof ticksRemaining === "number" &&
            Number.isFinite(ticksRemaining) &&
            ticksRemaining > 0
        )
    ) {
        return "";
    }

    if (config.despawnTimerMode === "ticks") {
        return ` - ${Math.max(0, Math.ceil(ticksRemaining))}`;
    }

    const tickMsRaw = timing && Number.isFinite(timing.tickMs) ? (timing.tickMs as number) : 600;
    const tickMs = Math.max(1, tickMsRaw | 0);
    const seconds = Math.max(0, (ticksRemaining * tickMs) / 1000);
    return ` - ${seconds.toFixed(1)}`;
}

function getTimerPhaseColor(
    stack: ClientGroundItemStack,
    timing: GroundItemsTimingContext | undefined,
    ticksRemaining: number | undefined,
): number | undefined {
    if (
        !(
            typeof ticksRemaining === "number" &&
            Number.isFinite(ticksRemaining) &&
            ticksRemaining > 0
        )
    ) {
        return undefined;
    }
    if (!timing) return undefined;

    const currentTick = Math.max(0, timing.currentTick | 0);
    const tickPhaseRaw = Number.isFinite(timing.tickPhase) ? (timing.tickPhase as number) : 0;
    const tickPhase = Math.max(0, Math.min(0.999, tickPhaseRaw));
    const nowTick = currentTick + tickPhase;

    if (stack.isPrivate === true) {
        return TIMER_COLOR_PRIVATE;
    }

    const privateUntilTick = Number(stack.privateUntilTick);
    if (Number.isFinite(privateUntilTick) && privateUntilTick > nowTick) {
        return TIMER_COLOR_PRIVATE;
    }

    return TIMER_COLOR_PUBLIC;
}

function shouldDisplayByOwnership(
    mode: GroundItemsOwnershipFilterMode,
    ownership: number,
    accountType: number,
): boolean {
    if (mode === "drops") {
        return ownership === 1 || ownership === 3;
    }
    if (mode === "takeable") {
        // RuneLite parity:
        // mains (accountType=0) can take "other" ownership items once public.
        return ownership !== TILE_ITEM_OWNERSHIP_OTHER || accountType === ACCOUNT_TYPE_MAIN;
    }
    return true;
}

function tierRank(tier: GroundItemsValueTier): number {
    if (tier === "insane") return 4;
    if (tier === "high") return 3;
    if (tier === "medium") return 2;
    if (tier === "low") return 1;
    return 0;
}

function colorTag(value: number, text: string): string {
    return `<col=${(value >>> 0).toString(16).padStart(6, "0")}>${text}</col>`;
}

function tokenizeItemList(raw: string): string[] {
    return raw
        .split(/,|\n/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
}

function exactListTokenName(rawToken: string): string | undefined {
    const token = rawToken.trim();
    const quantityMatch = /(.*?)([<>])\s*(\d+)$/.exec(token);
    let base = quantityMatch ? quantityMatch[1].trim() : token;
    const quoted = /^"(.*)"$/.exec(base);
    if (quoted) base = quoted[1];
    if (base.includes("*")) return undefined;
    const normalized = normalizeName(base);
    return normalized.length > 0 ? normalized : undefined;
}

export class GroundItemsPlugin {
    private readonly listeners: Set<GroundItemsListener> = new Set();
    private readonly persistence?: GroundItemsPluginPersistence;

    private highlightedPatterns: CompiledPattern[] = [];
    private hiddenPatterns: CompiledPattern[] = [];
    private compiledRules: CompiledGroundItemRules = compileGroundItemRules("");
    private config: GroundItemsPluginConfig;
    private state: GroundItemsPluginState;
    private version = 0;
    private hotkeyPressed = false;
    private overlayTemporarilyHidden = false;
    private previousHotkeyPressAt = Number.NEGATIVE_INFINITY;

    constructor(persistence?: GroundItemsPluginPersistence) {
        this.persistence = persistence;
        const loaded = persistence?.load();
        this.config = this.sanitizeConfig(loaded);
        this.highlightedPatterns = compileCsvList(this.config.highlightedItems);
        this.hiddenPatterns = compileCsvList(this.config.hiddenItems);
        this.compiledRules = compileGroundItemRules(this.config.advancedFilterRules);
        this.state = {
            config: this.config,
            version: this.version,
            ruleDiagnostics: this.compiledRules.diagnostics,
        };
    }

    subscribe(listener: GroundItemsListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    getState(): GroundItemsPluginState {
        return this.state;
    }

    getConfig(): GroundItemsPluginConfig {
        return this.state.config;
    }

    getVersion(): number {
        return this.version | 0;
    }

    getRuleDiagnostics(): readonly GroundItemRuleDiagnostic[] {
        return this.compiledRules.diagnostics;
    }

    setConfig(nextConfig: Partial<GroundItemsPluginConfig>): void {
        this.config = this.sanitizeConfig({
            ...this.config,
            ...nextConfig,
        });
        this.highlightedPatterns = compileCsvList(this.config.highlightedItems);
        this.hiddenPatterns = compileCsvList(this.config.hiddenItems);
        this.compiledRules = compileGroundItemRules(this.config.advancedFilterRules);
        this.commit();
    }

    evaluateStack(
        stack: ClientGroundItemStack,
        options?: {
            includeTimerLabel?: boolean;
            timing?: GroundItemsTimingContext;
            respectOwnershipFilter?: boolean;
            accountType?: number;
        },
    ): GroundItemEvaluation {
        const config = this.config;
        const ownership = Number.isFinite(stack.ownership) ? (stack.ownership as number) | 0 : 0;
        const accountTypeRaw = options?.accountType;
        const accountType = Number.isFinite(accountTypeRaw)
            ? (accountTypeRaw as number) | 0
            : ACCOUNT_TYPE_MAIN;
        const ownershipVisible = shouldDisplayByOwnership(
            config.ownershipFilterMode,
            ownership,
            accountType,
        );
        const respectOwnershipFilter = options?.respectOwnershipFilter !== false;
        if (respectOwnershipFilter && !ownershipVisible) {
            return {
                stack,
                label: "",
                baseLabel: "",
                color: config.hiddenColor,
                hidden: true,
                highlighted: false,
                explicitHighlight: false,
                tier: "none",
                showOverlay: false,
                showMenu: false,
                tileHighlight: false,
                menuPriority: 0,
                matchedRules: [],
            };
        }

        const normalizedName = normalizeName(stack.name);
        const quantity = Math.max(1, stack.quantity | 0);
        const exactHighlight = this.matches(
            this.highlightedPatterns,
            normalizedName,
            quantity,
            false,
        );
        const exactHidden = this.matches(this.hiddenPatterns, normalizedName, quantity, false);
        const wildcardHighlight = this.matches(
            this.highlightedPatterns,
            normalizedName,
            quantity,
            true,
        );
        const wildcardHidden = this.matches(this.hiddenPatterns, normalizedName, quantity, true);
        // RuneLite's list manager resolves conflicts by specificity first, then
        // highlight before hide at the same specificity.
        const explicitHighlight = exactHighlight || (!exactHidden && wildcardHighlight);
        const explicitHidden =
            !exactHighlight && (exactHidden || (!wildcardHighlight && wildcardHidden));
        const geValue = Math.max(0, stack.gePrice | 0) * quantity;
        const haValue = Math.max(0, stack.haPrice | 0) * quantity;
        const calculatedValue = valueByMode(geValue, haValue, config.valueCalculationMode);
        const tier = this.getTier(geValue, haValue, config);

        const canBeHidden = geValue > 0 || stack.tradeable === true || !config.dontHideUntradeables;
        const implicitHidden =
            !explicitHighlight &&
            canBeHidden &&
            geValue < config.hideUnderValue &&
            haValue < config.hideUnderValue;
        let hidden = explicitHidden || implicitHidden;

        let highlighted = false;
        let color = config.defaultColor;
        if (explicitHighlight) {
            highlighted = true;
            color = config.highlightedColor;
        } else if (!explicitHidden) {
            const tierColor = this.getTierColor(tier, config);
            if (tier !== "none" && tierColor !== undefined) {
                highlighted = true;
                color = tierColor;
            } else if (hidden) {
                color = config.hiddenColor;
            }
        } else {
            color = config.hiddenColor;
        }

        const ruleResult = evaluateGroundItemRules(this.compiledRules, {
            stack: stack as ClientGroundItemStack & { stackable?: boolean; noted?: boolean },
            value: calculatedValue,
            geValue,
            haValue,
        });
        if (ruleResult.hidden !== undefined) hidden = ruleResult.hidden;
        if (ruleResult.highlighted !== undefined) highlighted = ruleResult.highlighted;
        if (hidden) highlighted = false;
        if (ruleResult.color !== undefined) {
            color = ruleResult.color;
        } else if (hidden) {
            color = config.hiddenColor;
        } else if (ruleResult.highlighted === false) {
            color = config.defaultColor;
        } else if (ruleResult.highlighted === true && !explicitHighlight) {
            color = config.highlightedColor;
        }

        const ordinaryItemVisible = !hidden && (!config.showHighlightedOnly || highlighted);
        // Highlight mode chooses where category/value colours are applied; it
        // must not hide otherwise-visible labels. This mirrors RuneLite, where
        // menu-only/none falls back to the configured default overlay colour.
        const showOverlay = ruleResult.showOverlay ?? ordinaryItemVisible;
        const showMenu = ruleResult.showMenu ?? true;
        // The global tile toggle follows RuneLite's highlighted-item semantics:
        // ordinary visible clutter is not outlined. A rule may opt an otherwise
        // ordinary item in, but a terminal hide must always win over earlier
        // `apply | tile=true` styling.
        const tileHighlight =
            !hidden &&
            (ruleResult.tileHighlight !== undefined
                ? ruleResult.tileHighlight
                : config.highlightTiles && highlighted);

        const baseLabel = buildLabel(stack, config);
        const ticksRemaining = getTicksRemaining(stack, options?.timing);
        const timerLabel =
            options?.includeTimerLabel === true
                ? formatTimerSuffix(config, ticksRemaining, options?.timing)
                : "";
        const timerColor =
            timerLabel.length > 0
                ? getTimerPhaseColor(stack, options?.timing, ticksRemaining)
                : undefined;

        return {
            stack,
            label: `${baseLabel}${timerLabel}`,
            baseLabel,
            timerLabel: timerLabel.length > 0 ? timerLabel : undefined,
            timerColor,
            color,
            hidden,
            highlighted,
            explicitHighlight,
            tier,
            showOverlay,
            showMenu,
            beam: ruleResult.beam,
            tileHighlight,
            menuPriority: ruleResult.menuPriority ?? 0,
            matchedRules: ruleResult.matchedRules,
            terminalRule: ruleResult.terminalRule,
        };
    }

    shouldDisplayStack(
        stack: ClientGroundItemStack,
        options?: {
            accountType?: number;
        },
    ): boolean {
        if (!this.config.enabled) return false;
        const evalResult = this.evaluateStack(stack, { accountType: options?.accountType });
        if (this.hotkeyPressed) {
            // Empty labels identify entries excluded by the ownership filter.
            return evalResult.baseLabel.length > 0;
        }
        if (this.overlayTemporarilyHidden) return false;
        return evalResult.showOverlay;
    }

    shouldDisplayStackInMenu(stack: ClientGroundItemStack): boolean {
        if (!this.config.enabled) return true;
        // Alt is the recovery path for filtered items: revealing an item must
        // also restore its Take/examine and local Highlight/Hide actions.
        if (this.hotkeyPressed) return true;
        return this.evaluateStack(stack, { respectOwnershipFilter: false }).showMenu;
    }

    getOverlayColor(evaluation: GroundItemEvaluation): number {
        if (
            this.config.itemHighlightMode === "both" ||
            this.config.itemHighlightMode === "overlay"
        ) {
            return evaluation.color;
        }
        return this.config.defaultColor;
    }

    getValueForStack(stack: ClientGroundItemStack): number {
        const quantity = Math.max(1, stack.quantity | 0);
        const geValue = Math.max(0, stack.gePrice | 0) * quantity;
        const haValue = Math.max(0, stack.haPrice | 0) * quantity;
        return valueByMode(geValue, haValue, this.config.valueCalculationMode);
    }

    /**
     * Return stacks in insertion order. The menu renderer reverses that order,
     * so low-priority stacks are returned first and explicit highlights last.
     * `name` consequently sorts Z-A here to display A-Z in the open menu.
     */
    sortStacksForMenu(stacks: readonly ClientGroundItemStack[]): ClientGroundItemStack[] {
        const decorated = stacks.map((stack, index) => {
            const evaluation = this.evaluateStack(stack, { respectOwnershipFilter: false });
            const category = evaluation.explicitHighlight
                ? 3
                : evaluation.highlighted
                  ? 2
                  : evaluation.hidden
                    ? 0
                    : 1;
            return {
                stack,
                index,
                evaluation,
                category,
                value: this.getValueForStack(stack),
                name: normalizeName(stack.name),
            };
        });
        const mode = this.config.menuSortMode;
        decorated.sort((left, right) => {
            if (left.evaluation.menuPriority !== right.evaluation.menuPriority) {
                return left.evaluation.menuPriority - right.evaluation.menuPriority;
            }
            if (mode !== "off" && left.category !== right.category) {
                return left.category - right.category;
            }
            if (mode === "value" && left.value !== right.value) {
                return left.value - right.value;
            }
            if (mode === "name") {
                const byName = right.name.localeCompare(left.name);
                if (byName !== 0) return byName;
            }
            return left.index - right.index;
        });
        return decorated.map(({ stack }) => stack);
    }

    shouldCreateLootBeam(evaluation: GroundItemEvaluation): boolean {
        if (!this.config.enabled || !this.config.lootBeamEnabled || evaluation.hidden) {
            return false;
        }
        if (evaluation.beam !== undefined) return evaluation.beam;
        if (evaluation.explicitHighlight && this.config.lootBeamForHighlightedItems) return true;
        return tierRank(evaluation.tier) >= tierRank(this.config.lootBeamMinimumTier);
    }

    shouldNotify(evaluation: GroundItemEvaluation): boolean {
        if (!this.config.enabled) return false;
        if (evaluation.explicitHighlight && this.config.notifyHighlightedDrops) return true;
        const minimum = this.config.notifyMinimumTier;
        return minimum !== "off" && tierRank(evaluation.tier) >= tierRank(minimum);
    }

    updateHotkeyState(pressed: boolean, nowMs: number): void {
        const nextPressed = pressed === true;
        if (nextPressed === this.hotkeyPressed) return;
        const timestamp = Number.isFinite(nowMs) ? Math.max(0, nowMs) : 0;
        if (nextPressed) {
            const delay = this.config.doubleTapDelayMs;
            if (
                delay > 0 &&
                Number.isFinite(this.previousHotkeyPressAt) &&
                timestamp >= this.previousHotkeyPressAt &&
                timestamp - this.previousHotkeyPressAt <= delay
            ) {
                this.overlayTemporarilyHidden = !this.overlayTemporarilyHidden;
                this.previousHotkeyPressAt = Number.NEGATIVE_INFINITY;
            } else {
                this.previousHotkeyPressAt = timestamp;
            }
        }
        this.hotkeyPressed = nextPressed;
        this.commit(false);
    }

    isHotkeyRevealActive(): boolean {
        return this.hotkeyPressed;
    }

    isOverlayTemporarilyHidden(): boolean {
        return this.overlayTemporarilyHidden;
    }

    hasExactItemListEntry(itemName: string, list: "highlight" | "hide"): boolean {
        const normalized = normalizeName(itemName);
        if (normalized.length === 0) return false;
        const tokens = tokenizeItemList(
            list === "highlight" ? this.config.highlightedItems : this.config.hiddenItems,
        );
        return tokens.some(
            (token) =>
                exactListTokenName(token) === normalized && !/[<>]\s*\d+$/.test(token.trim()),
        );
    }

    /** Toggle an unconditional exact item name and remove exact conflicts. */
    toggleItemList(itemName: string, list: "highlight" | "hide"): void {
        const normalized = normalizeName(itemName);
        if (normalized.length === 0) return;
        const highlighted = tokenizeItemList(this.config.highlightedItems);
        const hidden = tokenizeItemList(this.config.hiddenItems);
        const selected = list === "highlight" ? highlighted : hidden;
        const opposite = list === "highlight" ? hidden : highlighted;
        const selectedHasName = selected.some((token) => {
            if (exactListTokenName(token) !== normalized) return false;
            return !/[<>]\s*\d+$/.test(token.trim());
        });
        const removeExactName = (tokens: string[]) =>
            tokens.filter((token) => exactListTokenName(token) !== normalized);
        const nextSelected = removeExactName(selected);
        const nextOpposite = removeExactName(opposite);
        if (!selectedHasName) nextSelected.push(itemName.trim());
        this.setConfig(
            list === "highlight"
                ? {
                      highlightedItems: nextSelected.join(", "),
                      hiddenItems: nextOpposite.join(", "),
                  }
                : {
                      hiddenItems: nextSelected.join(", "),
                      highlightedItems: nextOpposite.join(", "),
                  },
        );
    }

    getMenuTargetName(stack: ClientGroundItemStack, baseName?: string): string {
        const name = typeof baseName === "string" && baseName.length > 0 ? baseName : stack.name;
        if (!this.config.enabled) {
            return name;
        }
        if (!this.config.showMenuItemQuantities) {
            return name;
        }
        if ((stack.quantity | 0) <= 1) {
            return name;
        }
        return `${name} x ${formatWithCommas(stack.quantity)}`;
    }

    getMenuTargetColorized(stack: ClientGroundItemStack, targetName: string): string {
        if (!this.config.enabled) {
            return targetName;
        }
        const evaluation = this.evaluateStack(stack, { respectOwnershipFilter: false });
        if (!this.shouldColorMenuEvaluation(evaluation)) return targetName;
        if (this.config.menuHighlightMode === "option") return targetName;
        return colorTag(evaluation.color, targetName);
    }

    getMenuOptionColorized(stack: ClientGroundItemStack, option: string): string {
        if (!this.config.enabled) return option;
        const evaluation = this.evaluateStack(stack, { respectOwnershipFilter: false });
        if (!this.shouldColorMenuEvaluation(evaluation)) return option;
        if (this.config.menuHighlightMode === "name") return option;
        return colorTag(evaluation.color, option);
    }

    getMenuStyle(
        stack: ClientGroundItemStack,
        option: string,
        baseName?: string,
    ): { option: string; targetName: string; evaluation: GroundItemEvaluation } {
        const targetName = this.getMenuTargetName(stack, baseName);
        const evaluation = this.evaluateStack(stack, { respectOwnershipFilter: false });
        if (!this.config.enabled || !this.shouldColorMenuEvaluation(evaluation)) {
            return { option, targetName, evaluation };
        }
        return {
            option:
                this.config.menuHighlightMode === "name"
                    ? option
                    : colorTag(evaluation.color, option),
            targetName:
                this.config.menuHighlightMode === "option"
                    ? targetName
                    : colorTag(evaluation.color, targetName),
            evaluation,
        };
    }

    shouldDeprioritizeInMenu(stack: ClientGroundItemStack): boolean {
        if (!this.config.enabled) {
            return false;
        }
        if (!this.config.rightClickHidden) {
            return false;
        }
        return this.evaluateStack(stack, { respectOwnershipFilter: false }).hidden;
    }

    private shouldColorMenuEvaluation(evaluation: GroundItemEvaluation): boolean {
        if (evaluation.hidden) return this.config.recolorMenuHiddenItems;
        if (this.config.itemHighlightMode !== "both" && this.config.itemHighlightMode !== "menu") {
            return false;
        }
        return (
            evaluation.highlighted ||
            (evaluation.matchedRules.length > 0 && evaluation.color !== this.config.defaultColor)
        );
    }

    private getTier(
        geValue: number,
        haValue: number,
        config: GroundItemsPluginConfig,
    ): GroundItemsValueTier {
        const value = valueByMode(geValue, haValue, config.valueCalculationMode);
        if (config.insaneValuePrice > 0 && value > config.insaneValuePrice) return "insane";
        if (config.highValuePrice > 0 && value > config.highValuePrice) return "high";
        if (config.mediumValuePrice > 0 && value > config.mediumValuePrice) return "medium";
        if (config.lowValuePrice > 0 && value > config.lowValuePrice) return "low";
        return "none";
    }

    private getTierColor(
        tier: GroundItemsValueTier,
        config: GroundItemsPluginConfig,
    ): number | undefined {
        if (tier === "insane") return config.insaneValueColor;
        if (tier === "high") return config.highValueColor;
        if (tier === "medium") return config.mediumValueColor;
        if (tier === "low") return config.lowValueColor;
        return undefined;
    }

    private matches(
        patterns: CompiledPattern[],
        normalizedName: string,
        quantity: number,
        wildcard: boolean,
    ): boolean {
        for (const pattern of patterns) {
            if (pattern.wildcard !== wildcard) continue;
            const nameMatches =
                pattern.exact !== undefined
                    ? pattern.exact === normalizedName
                    : pattern.regex
                      ? pattern.regex.test(normalizedName)
                      : false;
            if (!nameMatches) continue;
            if (!matchesQuantity(pattern, quantity)) continue;
            return true;
        }
        return false;
    }

    private sanitizeConfig(
        input: Partial<GroundItemsPluginConfig> | undefined,
    ): GroundItemsPluginConfig {
        const src = input ? input : {};
        return {
            enabled: src.enabled !== false,
            highlightedItems:
                typeof src.highlightedItems === "string"
                    ? src.highlightedItems
                    : DEFAULT_CONFIG.highlightedItems,
            hiddenItems:
                typeof src.hiddenItems === "string" ? src.hiddenItems : DEFAULT_CONFIG.hiddenItems,
            showHighlightedOnly:
                src.showHighlightedOnly === true ? true : DEFAULT_CONFIG.showHighlightedOnly,
            rightClickHidden:
                src.rightClickHidden === true ? true : DEFAULT_CONFIG.rightClickHidden,
            recolorMenuHiddenItems:
                src.recolorMenuHiddenItems === true ? true : DEFAULT_CONFIG.recolorMenuHiddenItems,
            showMenuItemQuantities: src.showMenuItemQuantities !== false,
            dontHideUntradeables: src.dontHideUntradeables !== false,
            hideUnderValue: sanitizeNumber(src.hideUnderValue, DEFAULT_CONFIG.hideUnderValue),
            priceDisplayMode: sanitizeMode(src.priceDisplayMode, DEFAULT_CONFIG.priceDisplayMode),
            valueCalculationMode: sanitizeValueMode(
                src.valueCalculationMode,
                DEFAULT_CONFIG.valueCalculationMode,
            ),
            defaultColor: sanitizeColor(src.defaultColor, DEFAULT_CONFIG.defaultColor),
            highlightedColor: sanitizeColor(src.highlightedColor, DEFAULT_CONFIG.highlightedColor),
            hiddenColor: sanitizeColor(src.hiddenColor, DEFAULT_CONFIG.hiddenColor),
            lowValueColor: sanitizeColor(src.lowValueColor, DEFAULT_CONFIG.lowValueColor),
            lowValuePrice: sanitizeNumber(src.lowValuePrice, DEFAULT_CONFIG.lowValuePrice),
            mediumValueColor: sanitizeColor(src.mediumValueColor, DEFAULT_CONFIG.mediumValueColor),
            mediumValuePrice: sanitizeNumber(src.mediumValuePrice, DEFAULT_CONFIG.mediumValuePrice),
            highValueColor: sanitizeColor(src.highValueColor, DEFAULT_CONFIG.highValueColor),
            highValuePrice: sanitizeNumber(src.highValuePrice, DEFAULT_CONFIG.highValuePrice),
            insaneValueColor: sanitizeColor(src.insaneValueColor, DEFAULT_CONFIG.insaneValueColor),
            insaneValuePrice: sanitizeNumber(src.insaneValuePrice, DEFAULT_CONFIG.insaneValuePrice),
            ownershipFilterMode: sanitizeOwnershipFilterMode(
                src.ownershipFilterMode,
                DEFAULT_CONFIG.ownershipFilterMode,
            ),
            despawnTimerMode: sanitizeDespawnTimerMode(
                src.despawnTimerMode,
                DEFAULT_CONFIG.despawnTimerMode,
            ),
            itemHighlightMode: sanitizeItemHighlightMode(
                src.itemHighlightMode,
                DEFAULT_CONFIG.itemHighlightMode,
            ),
            menuHighlightMode: sanitizeMenuHighlightMode(
                src.menuHighlightMode,
                DEFAULT_CONFIG.menuHighlightMode,
            ),
            highlightTiles: src.highlightTiles === true,
            tileHighlightFillAlpha: sanitizeAlpha(
                src.tileHighlightFillAlpha,
                DEFAULT_CONFIG.tileHighlightFillAlpha,
            ),
            textOutline: src.textOutline !== false,
            collapseGroundItemMenu: src.collapseGroundItemMenu === true,
            menuSortMode: sanitizeMenuSortMode(src.menuSortMode, DEFAULT_CONFIG.menuSortMode),
            lootBeamEnabled: src.lootBeamEnabled !== false,
            lootBeamForHighlightedItems: src.lootBeamForHighlightedItems !== false,
            lootBeamStyle: sanitizeLootBeamStyle(
                src.lootBeamStyle,
                DEFAULT_CONFIG.lootBeamStyle,
            ),
            lootBeamMinimumTier: sanitizeTier(
                src.lootBeamMinimumTier,
                DEFAULT_CONFIG.lootBeamMinimumTier,
            ),
            doubleTapDelayMs: Math.min(
                5_000,
                sanitizeNumber(src.doubleTapDelayMs, DEFAULT_CONFIG.doubleTapDelayMs),
            ),
            notifyHighlightedDrops: src.notifyHighlightedDrops === true,
            notifyMinimumTier: sanitizeNotificationTier(
                src.notifyMinimumTier,
                DEFAULT_CONFIG.notifyMinimumTier,
            ),
            advancedFilterRules:
                typeof src.advancedFilterRules === "string"
                    ? src.advancedFilterRules
                    : DEFAULT_CONFIG.advancedFilterRules,
        };
    }

    private commit(persist = true): void {
        this.version++;
        this.state = {
            config: this.config,
            version: this.version,
            ruleDiagnostics: this.compiledRules.diagnostics,
        };
        if (persist) this.persistence?.save(this.config);
        for (const listener of this.listeners) {
            try {
                listener();
            } catch (err) {
                console.log("[ground-items] listener failed", err);
            }
        }
    }
}
