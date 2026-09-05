import { MenuTargetType } from "@august/osrs-engine/MenuEntry";
import { MenuAction } from "@client/ui/runtime/menu/MenuAction";
import { MenuOpcode } from "@client/ui/runtime/menu/MenuState";
import type { SimpleMenuEntry } from "@client/ui/runtime/menu/MenuEngine";

export interface MenuSwapPreference {
    name: string;
    left?: string;
    shift?: string;
}
export interface MenuEntrySwapperConfig {
    enabled: boolean;
    bank: boolean;
    trade: boolean;
    travel: boolean;
    quick: boolean;
    swaps: Record<string, MenuSwapPreference>;
}
export interface MenuEntrySwapperPersistence {
    load(): Partial<MenuEntrySwapperConfig> | undefined;
    save(config: MenuEntrySwapperConfig): void;
}
const clean = (value: string) => value.replace(/<[^>]*>/g, "").trim().toLowerCase();

/** Reorders existing actions only. Opcode, op slot, coordinates and handler stay intact. */
export class MenuEntrySwapperPlugin {
    private listeners = new Set<() => void>();
    private state: { config: MenuEntrySwapperConfig };

    constructor(private readonly persistence?: MenuEntrySwapperPersistence) {
        this.state = { config: this.sanitize(persistence?.load()) };
    }
    private sanitize(input?: Partial<MenuEntrySwapperConfig>): MenuEntrySwapperConfig {
        const swaps: Record<string, MenuSwapPreference> = {};
        for (const [key, value] of Object.entries(input?.swaps ?? {}).slice(0, 2000)) {
            if (!/^[234]:\d+$/.test(key) || !value || typeof value.name !== "string") continue;
            swaps[key] = {
                name: value.name.slice(0, 120),
                left: typeof value.left === "string" ? value.left.slice(0, 80) : undefined,
                shift: typeof value.shift === "string" ? value.shift.slice(0, 80) : undefined,
            };
        }
        return {
            enabled: input?.enabled !== false,
            bank: input?.bank === true,
            trade: input?.trade === true,
            travel: input?.travel === true,
            quick: input?.quick === true,
            swaps,
        };
    }
    getState = () => this.state;
    getConfig = () => this.state.config;
    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };
    setConfig(config: Partial<MenuEntrySwapperConfig>): void {
        this.state = { config: this.sanitize({ ...this.state.config, ...config }) };
        this.persistence?.save(this.state.config);
        for (const listener of this.listeners) listener();
    }
    removeSwap(key: string): void {
        const swaps = { ...this.state.config.swaps };
        delete swaps[key];
        this.setConfig({ swaps });
    }
    setSwap(entry: SimpleMenuEntry, mode: "left" | "shift", option: string): void {
        const key = this.key(entry);
        if (!key) return;
        this.setConfig({ swaps: {
            ...this.state.config.swaps,
            [key]: { ...this.state.config.swaps[key], name: clean(entry.target ?? ""), [mode]: option },
        } });
    }
    private key(entry: SimpleMenuEntry): string | undefined {
        if (entry.targetType !== MenuTargetType.NPC && entry.targetType !== MenuTargetType.LOC &&
            entry.targetType !== MenuTargetType.OBJ) return undefined;
        if (!Number.isSafeInteger(entry.targetId) || entry.targetId! < 0) return undefined;
        return `${entry.targetType}:${entry.targetId}`;
    }
    private isOperation(entry: SimpleMenuEntry): boolean {
        return this.key(entry) !== undefined && typeof entry.actionIndex === "number" &&
            entry.actionIndex >= 0 && !entry.deprioritized && clean(entry.option) !== "attack";
    }
    apply(entries: SimpleMenuEntry[], shift: boolean, configure: boolean): SimpleMenuEntry[] {
        const config = this.state.config;
        if (!config.enabled || entries.some(e =>
            (e.action === MenuAction.Use || e.action === MenuAction.Cast) && e.actionIndex === undefined
        )) return entries;
        const result = entries.slice();
        // Keep entity ordering: swaps must not promote an NPC behind another NPC.
        const groups = new Map<string, SimpleMenuEntry[]>();
        for (const entry of entries) {
            if (!this.isOperation(entry)) continue;
            const groupKey = `${this.key(entry)}:${entry.npcServerId}:${entry.mapX}:${entry.mapY}`;
            const group = groups.get(groupKey) ?? [];
            group.push(entry);
            groups.set(groupKey, group);
        }
        for (const group of groups.values()) {
            const anchor = group[0];
            const key = this.key(anchor)!;
            const saved = config.swaps[key];
            let desired = shift ? saved?.shift ?? saved?.left : saved?.left;
            if (!desired) {
                const preset = group.find(e => {
                    const option = clean(e.option);
                    return (config.bank && option === "bank") || (config.trade && option === "trade") ||
                        (config.travel && ["travel", "pay-fare", "charter", "take-boat", "take boat"].includes(option)) ||
                        (config.quick && ["quick-pass", "quick-open", "quick-start", "quick-travel"].includes(option));
                });
                desired = preset?.option;
            }
            const selected = desired && group.find(e => clean(e.option) === clean(desired));
            if (selected) {
                const top = result.indexOf(anchor);
                const index = result.indexOf(selected);
                result[top] = shift ? { ...selected, shiftClick: true } : selected;
                if (index !== top) result[index] = anchor;
            }
            if (configure && shift) {
                for (const mode of ["left", "shift"] as const) {
                    result.push({
                        option: mode === "left" ? "Swap left-click" : "Swap shift-click",
                        target: anchor.target,
                        opcode: MenuOpcode.Custom,
                        subEntries: group.map(entry => ({
                            option: entry.option,
                            opcode: MenuOpcode.Custom,
                            onClick: (_x, _y, ctx) => {
                                this.setSwap(anchor, mode, entry.option);
                                ctx?.closeMenu?.();
                            },
                        })),
                    });
                }
                result.push({ option: "Reset swaps", target: anchor.target, opcode: MenuOpcode.Custom,
                    onClick: (_x, _y, ctx) => { this.removeSwap(key); ctx?.closeMenu?.(); } });
            }
        }
        return result;
    }
}
