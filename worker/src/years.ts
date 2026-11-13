// Goal years: which year is active, closing a year and what the archive shows.
import type { GoalOut } from "./data";

export class InvalidClose extends Error {}

const ACTIVE_KEY = "goals:activeYear";

/** The year whose goals the panel shows. Starts at the calendar year and only moves when 303 closes a year. */
export async function activeYear(store: KVNamespace, today: string): Promise<string> {
  const saved = await store.get(ACTIVE_KEY);
  if (saved && /^\d{4}$/.test(saved)) return saved;
  const year = today.slice(0, 4);
  await store.put(ACTIVE_KEY, year);
  return year;
}

export function setActiveYear(store: KVNamespace, year: string) {
  return store.put(ACTIVE_KEY, year);
}

const unfinished = (g: GoalOut) => g.kind === "Goal" && g.status !== "Done" && g.status !== "Archived";

/**
 * Checks a close request against the year's goals and returns what to copy into the next year.
 * Only unfinished top-level goals of that year can be carried over; their open milestones go with them.
 */
export function planClose(goals: GoalOut[], year: string, active: string, carryIds: unknown) {
  if (year !== active) throw new InvalidClose(`Only the active year (${active}) can be closed`);
  if (!Array.isArray(carryIds) || carryIds.some((x) => typeof x !== "string")) throw new InvalidClose("Choose which goals to carry over");
  const open = new Map(goals.filter(unfinished).map((g) => [g.id, g]));
  const carry = [...new Set(carryIds as string[])].map((id) => {
    const g = open.get(id);
    if (!g) throw new InvalidClose("A goal to carry over is not an unfinished goal of this year");
    return { goal: g, milestones: g.children.filter((c) => c.kind === "Milestone" && c.status !== "Done" && c.status !== "Archived") };
  });
  return { next: String(Number(year) + 1), carry };
}

export interface AreaSummary { area: string; done: number; total: number; progress: number | null }

/** Per-area result of a year: goals done and average progress (Done counts as 100%). */
export function summarizeYear(goals: GoalOut[], areas: readonly string[]): { done: number; total: number; areas: AreaSummary[] } {
  const live = goals.filter((g) => g.status !== "Archived");
  const value = (g: GoalOut) => (g.status === "Done" ? 1 : g.progress);
  return {
    done: live.filter((g) => g.status === "Done").length,
    total: live.length,
    areas: areas.map((area) => {
      const gs = live.filter((g) => g.area === area);
      const vals = gs.map(value).filter((v): v is number => v !== null);
      return { area, done: gs.filter((g) => g.status === "Done").length, total: gs.length, progress: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null };
    }),
  };
}
