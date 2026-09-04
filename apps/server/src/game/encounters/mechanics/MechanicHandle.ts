/**
 * A live encounter mechanic. Every mechanic exposes the same cancellation
 * contract so encounter cleanup never needs mechanic-specific knowledge.
 */
export interface MechanicHandle {
    readonly id: string;
    readonly isActive: boolean;
    cancel(): void;
    /** Optional lifecycle observation used by registries to release tracking promptly. */
    onCancelled?(listener: () => void): () => void;
}

export function createMechanicHandle(
    id: string,
    onCancel: () => void,
): MechanicHandle {
    let active = true;
    const cancellationListeners = new Set<() => void>();
    return Object.freeze({
        id,
        get isActive(): boolean {
            return active;
        },
        cancel(): void {
            if (!active) return;
            active = false;
            try {
                onCancel();
            } finally {
                for (const listener of [...cancellationListeners]) {
                    try {
                        listener();
                    } catch {
                        // Observers release bookkeeping only and must not block cleanup.
                    }
                }
                cancellationListeners.clear();
            }
        },
        onCancelled(listener: () => void): () => void {
            if (!active) {
                listener();
                return () => undefined;
            }
            cancellationListeners.add(listener);
            return () => cancellationListeners.delete(listener);
        },
    });
}

/** A completed handle for a mechanic that had nothing valid to do. */
export function createInactiveMechanicHandle(id: string): MechanicHandle {
    return Object.freeze({
        id,
        isActive: false,
        cancel(): void {},
        onCancelled(listener: () => void): () => void {
            listener();
            return () => undefined;
        },
    });
}
