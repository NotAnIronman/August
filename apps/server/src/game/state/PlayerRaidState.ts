export interface RaidCheckpoint {
    version: 1;
    raid: "theatre-of-blood";
    runId: string;
    completedRooms: number;
    access: "solo" | "party";
    roster: string[];
    status: "active" | "disconnected";
}
export type RaidRestrictedAction = "trade" | "pick up items" | "open a bank" | "teleport" | "leave" | "log out";

export function sanitizeRaidCheckpoint(value: unknown): RaidCheckpoint | undefined {
    if (!value || typeof value !== "object") return;
    const v = value as RaidCheckpoint;
    if (v.version !== 1 || v.raid !== "theatre-of-blood" || typeof v.runId !== "string" ||
        !/^[a-zA-Z0-9-]{1,80}$/.test(v.runId) || !Number.isInteger(v.completedRooms) || v.completedRooms < 0 || v.completedRooms > 5 ||
        !["solo","party"].includes(v.access) || !["active","disconnected"].includes(v.status) ||
        !Array.isArray(v.roster) || v.roster.length < 1 || v.roster.length > 5 ||
        v.roster.some(name => typeof name !== "string" || !name.trim() || name.length > 64)) return;
    return {version:1,raid:"theatre-of-blood",runId:v.runId,completedRooms:v.completedRooms,
        access:v.access,roster:[...new Set(v.roster)],status:v.status};
}

/** Persistent checkpoint plus transient, single-use confirmation authority. */
export class PlayerRaidState {
    /** Derived from the durable run's death list; not independent save authority. */
    spectating=false;
    checkpoint?: RaidCheckpoint;
    /** Saving a private room's source coordinates must not restore its public map. */
    recoveryLocation?: { x: number; y: number; level: number };
    private bypassDepth = 0;
    get isInternal(): boolean { return this.bypassDepth > 0; }
    private revision = 0;
    private promptId = 0;
    confirm?: (action: RaidRestrictedAction, accept: () => void) => void;
    /** Synchronous durable save; a failed save must prevent the restricted action. */
    persist?: () => void;
    serialize(): RaidCheckpoint | null { return this.checkpoint ? {...this.checkpoint,roster:[...this.checkpoint.roster]} : null; }
    deserialize(value: unknown): void {
        this.clear();
        this.checkpoint = sanitizeRaidCheckpoint(value);
        // No live session survives deserialization. An active save therefore
        // represents a server interruption. Voluntary exits and restricted
        // actions durably clear their checkpoint before executing.
        if (this.checkpoint?.status === "active") this.disconnected();
    }
    set(value: RaidCheckpoint): void { this.checkpoint = sanitizeRaidCheckpoint(value); this.revision++; this.promptId++; }
    clear(): void { this.checkpoint = undefined; this.spectating=false;this.revision++; this.promptId++; }
    disconnected(): void {
        if (this.checkpoint) this.set({...this.checkpoint,status:"disconnected"});
    }
    internally<T>(fn: () => T): T {
        this.bypassDepth++;
        try { return fn(); } finally { this.bypassDepth--; }
    }
    /** true means caller must stop; acceptance re-runs its normal validation. */
    guard(action: RaidRestrictedAction, retry: () => void): boolean {
        const checkpoint = this.checkpoint;
        if (!checkpoint || this.bypassDepth > 0 ||
            (checkpoint.status === "active" && action === "pick up items")) return false;
        const revision = this.revision;
        const prompt = ++this.promptId;
        this.confirm?.(action, () => {
            if (revision !== this.revision || prompt !== this.promptId) return;
            this.clear();
            try { this.persist?.(); } catch (error) {
                this.set(checkpoint);
                throw error;
            }
            retry();
        });
        return true;
    }
}
