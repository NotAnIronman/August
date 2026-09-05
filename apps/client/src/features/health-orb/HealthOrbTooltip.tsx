import { useSyncExternalStore } from "react";
import { HEALTH_ORB_CURE_WIDGETS, HEALTH_ORB_TIMER_VARPS } from "@august/protocol/ui/healthOrb";
import type { VarManager } from "@august/osrs-engine/config/vartype/VarManager";

type Snapshot = { text: string; x: number; y: number } | null;
let snapshot: Snapshot = null;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const getHealthOrbTooltipSnapshot = () => snapshot;

export function clearHealthOrbTooltip(): void {
    if (!snapshot) return;
    snapshot = null;
    listeners.forEach(fn => fn());
}

export function updateHealthOrbTooltip(hits: readonly { uid: number }[], x: number, y: number,
    vars: VarManager, canvas?: HTMLCanvasElement): void {
    let next: Snapshot = null;
    const hovering = hits.some(w => (HEALTH_ORB_CURE_WIDGETS as readonly number[]).includes(w.uid));
    const status = hovering ? vars.getVarp(102) : 0;
    if (canvas && status > 0) {
        const venom = status >= 1_000_000;
        const damage = venom ? status - 1_000_000 : status;
        const rect = canvas.getBoundingClientRect();
        const remaining = vars.getVarp(HEALTH_ORB_TIMER_VARPS.remaining);
        next = { x: rect.left + x * rect.width / canvas.width,
            y: rect.top + y * rect.height / canvas.height,
            text: `${venom ? "Venomed" : "Poisoned"} for ${vars.getVarp(HEALTH_ORB_TIMER_VARPS.elapsed)}s\n`
                + `Next hit: ${damage} damage in ${vars.getVarp(HEALTH_ORB_TIMER_VARPS.nextHit)}s\n`
                + (venom ? "Lasts until cured" : `Wears off in ${Math.max(0, remaining)}s`) };
    }
    if (JSON.stringify(next) === JSON.stringify(snapshot)) return;
    snapshot = next;
    listeners.forEach(fn => fn());
}

export function HealthOrbTooltip(): JSX.Element | null {
    const state = useSyncExternalStore(subscribe, getHealthOrbTooltipSnapshot, getHealthOrbTooltipSnapshot);
    if (!state) return null;
    return <div role="tooltip" style={{ position: "fixed", zIndex: 100, pointerEvents: "none",
        left: Math.max(0, state.x - 200), top: state.y + 20, padding: "6px 8px", whiteSpace: "pre-line",
        background: "#ffffd0", color: "#000", border: "1px solid #000", fontSize: 12 }}>{state.text}</div>;
}
