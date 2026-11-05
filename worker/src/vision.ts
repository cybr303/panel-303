// Vision Board: which photos show today. Pure selection logic lives here so it can be tested.

export interface Photo {
  id: string;
  name: string;
  area: string | null;
  inCollage: boolean;
  order: number;
  /** CSS object-position keyword: center, top, bottom, left, right. */
  focus: string;
  /** Changes when the photo row is edited; used to bust caches. */
  version: string;
}

export interface VisionToday {
  collage: Photo[];
  /** One cover per area that has photos; null when the area has none. */
  covers: Record<string, Photo | null>;
}

/** Small deterministic PRNG (mulberry32) so a given day always gives the same pick. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function shuffle<T>(items: T[], seed: string): T[] {
  const r = rng(hash(seed));
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Picks today's photos.
 * - Each area gets one cover, chosen among that area's photos; it changes every day.
 * - The collage shows `size` photos marked "In collage", different every day.
 *   Today's covers are left out of the collage when there are enough other photos.
 */
export function pickToday(photos: Photo[], areas: readonly string[], day: string, size: number): VisionToday {
  const sorted = [...photos].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const covers: Record<string, Photo | null> = {};
  for (const area of areas) {
    const own = sorted.filter((p) => p.area === area);
    covers[area] = own.length ? shuffle(own, `${day}|cover|${area}`)[0] : null;
  }
  const coverIds = new Set(Object.values(covers).filter((p): p is Photo => !!p).map((p) => p.id));
  const pool = sorted.filter((p) => p.inCollage);
  const fresh = pool.filter((p) => !coverIds.has(p.id));
  const base = fresh.length >= size ? fresh : pool;
  return { collage: shuffle(base, `${day}|collage`).slice(0, size), covers };
}
