/** Small deterministic PRNG so encounter tests and replays are reproducible. */
export class EncounterRandom {
    private state: number;

    constructor(seed: number) {
        this.state = (Math.trunc(seed) >>> 0) || 0x6d2b79f5;
    }

    next(): number {
        let value = (this.state += 0x6d2b79f5);
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
    }

    weightedIndex(weights: readonly number[]): number {
        const total = weights.reduce((sum, value) => sum + Math.max(0, value), 0);
        if (total <= 0) return 0;
        let roll = this.next() * total;
        for (let index = 0; index < weights.length; index++) {
            roll -= Math.max(0, weights[index] ?? 0);
            if (roll < 0) return index;
        }
        return Math.max(0, weights.length - 1);
    }
}

