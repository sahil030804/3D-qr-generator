/** Deterministic seeded PRNG (mulberry32) with convenience helpers. No Math.random(). */
export class SeededRandom {
    constructor(seed) {
        this.state = seed >>> 0 || 0x9e3779b9;
    }
    /** Float in [0, 1) */
    next() {
        let t = (this.state += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    range(min, max) {
        return min + (max - min) * this.next();
    }
    int(min, max) {
        return Math.floor(this.range(min, max + 1));
    }
    pick(arr) {
        return arr[Math.floor(this.next() * arr.length) % arr.length];
    }
    /** Approx. standard normal via Box-Muller (deterministic). */
    gaussian(mean = 0, std = 1) {
        let u = 0;
        let v = 0;
        while (u === 0)
            u = this.next();
        while (v === 0)
            v = this.next();
        const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        return mean + z * std;
    }
    chance(p) {
        return this.next() < p;
    }
    /** Deterministic string seed -> uint32 */
    static hashSeed(input) {
        if (typeof input === 'number')
            return input >>> 0;
        let h = 2166136261;
        for (let i = 0; i < input.length; i++) {
            h ^= input.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }
}
