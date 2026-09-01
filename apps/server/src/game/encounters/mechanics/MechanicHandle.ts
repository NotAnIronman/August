/**
 * A live encounter mechanic. Every mechanic exposes the same cancellation
 * contract so encounter cleanup never needs mechanic-specific knowledge.
 */
export interface MechanicHandle {
    readonly id: string;
    readonly isActive: boolean;
    cancel(): void;
}

export function createMechanicHandle(
    id: string,
    onCancel: () => void,
): MechanicHandle {
    let active = true;
    return Object.freeze({
        id,
        get isActive(): boolean {
            return active;
        },
        cancel(): void {
            if (!active) return;
            active = false;
            onCancel();
        },
    });
}

/** A completed handle for a mechanic that had nothing valid to do. */
export function createInactiveMechanicHandle(id: string): MechanicHandle {
    return Object.freeze({
        id,
        isActive: false,
        cancel(): void {},
    });
}
