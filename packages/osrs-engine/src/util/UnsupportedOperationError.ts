/** Signals that a recognized input selected a feature this engine does not support. */
export class UnsupportedOperationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "UnsupportedOperationError";
    }
}
