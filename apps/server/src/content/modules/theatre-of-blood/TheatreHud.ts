import { SkillId } from "@august/osrs-engine/skill/skills";
import type { PlayerState } from "@server/game/player";
import type { ScriptServices } from "@server/game/scripts/types";
import { raidAccount, raidHitpoints } from "./MaidenEncounter";
export const THEATRE_HUD_GROUP = 28;
export const THEATRE_ORB_VARBITS = [6442, 6443, 6444, 6445, 6446] as const;
export function theatreOrbHealth(player?: PlayerState): number {
    if (!player)
        return 31; // disconnected; keep its position rather than hiding/reordering it
    const hp = raidHitpoints(player), max = player.skillSystem.getSkill(SkillId.Hitpoints).baseLevel;
    return hp <= 0 ? 30 : 1 + Math.max(1, Math.min(26, Math.ceil(hp * 26 / Math.max(1, max))));
}
/** Native cache HUD, sharing the durable roster used by targeting and reward slots. */
export class TheatreHud {
    private readonly shown = new Map<PlayerState, {
        uid: number;
        signature: string;
    }>();
    constructor(private readonly services: ScriptServices) { }
    watch(player: PlayerState): void { if (!this.shown.has(player))
        this.shown.set(player, { uid: -1, signature: "" }); }
    tick(): void {
        for (const [player, old] of this.shown) {
            const instance = this.services.instances.get(player.id), checkpoint = player.raidProgress.checkpoint;
            const run = checkpoint && this.services.instances.theatreRuns?.load(checkpoint.runId);
            const preview = instance?.definitionId?.startsWith("theatre-preview:");
            if (!instance || instance.worldViewId !== player.worldViewId || (!preview && (!run || checkpoint?.status !== "active"))) {
                this.close(player);
                continue;
            }
            const members = this.services.instances.getMemberPlayers(instance.id);
            const roster = run?.roster ?? [raidAccount(player)];
            const ordered = roster.map(key => members.find(p => raidAccount(p) === key));
            const names = roster.map((key, i) => ordered[i]?.name ?? key);
            while (names.length < 5)
                names.push("");
            const orbs = Array.from({ length: 5 }, (_, i) => i < roster.length ? theatreOrbHealth(ordered[i]) : 0);
            const uid = this.services.viewport.getViewportTrackerFrontUid(player.displayMode);
            const signature = JSON.stringify([uid, names, orbs, roster.indexOf(raidAccount(player))]);
            if (signature === old.signature)
                continue;
            const varbits: Record<number, number> = { 6440: 2, 6441: roster.indexOf(raidAccount(player)) + 1 };
            THEATRE_ORB_VARBITS.forEach((id, i) => varbits[id] = orbs[i]);
            if (old.uid !== uid) {
                if (old.uid >= 0)
                    this.services.dialog.closeSubInterface(player, old.uid, THEATRE_HUD_GROUP);
                this.services.dialog.openSubInterface(player, uid, THEATRE_HUD_GROUP, 1, { varbits, preScripts: [{ scriptId: 2301, args: names }], modal: false });
            }
            else {
                for (const [id, value] of Object.entries(varbits))
                    this.services.variables.sendVarbit(player, Number(id), value);
                this.services.dialog.queueClientScript(player.id, 2301, ...names);
            }
            this.shown.set(player, { uid, signature });
        }
    }
    private close(player: PlayerState): void {
        const old = this.shown.get(player);
        if (old?.uid !== undefined && old.uid >= 0)
            this.services.dialog.closeSubInterface(player, old.uid, THEATRE_HUD_GROUP);
        this.services.variables.sendVarbit(player, 6440, 0);
        this.shown.delete(player);
    }
    dispose(): void { for (const player of this.shown.keys())
        this.close(player); }
}
