import { createHash } from "node:crypto";

/**
 * Deterministic PRNG seeded from a string. The mock AI must give the same
 * answer for the same document every time, but genuinely different answers for
 * different documents — never one canned blob.
 */
export function makeRng(seed: string) {
  const h = createHash("sha256").update(seed).digest();
  let a = h.readUInt32LE(0) || 1;
  let b = h.readUInt32LE(4) || 2;
  let c = h.readUInt32LE(8) || 3;
  let d = h.readUInt32LE(12) || 4;

  const next = () => {
    // sfc32
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    d = (d + 1) >>> 0;
    t = (t + d) >>> 0;
    c = (c + t) >>> 0;
    return t / 4294967296;
  };

  return {
    next,
    /** Uniform float in [min, max). */
    float: (min: number, max: number) => min + next() * (max - min),
    int: (min: number, max: number) => Math.floor(min + next() * (max - min + 1)),
    /** True with probability p. */
    chance: (p: number) => next() < p,
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!,
  };
}

export type Rng = ReturnType<typeof makeRng>;
