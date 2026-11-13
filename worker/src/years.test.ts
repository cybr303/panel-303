import { describe, expect, it } from "vitest";
import type { GoalOut } from "./data";
import { activeYear, InvalidClose, planClose, summarizeYear } from "./years";

const g = (id: string, status: string, extra: Partial<GoalOut> = {}): GoalOut => ({
  id, name: id, kind: "Goal", status, tracking: "Manual", habit: null, target: null, current: null, area: "Travel",
  source: "", due: null, notes: "", order: 1, progress: null, children: [], ...extra,
});

describe("active year", () => {
  it("starts at the calendar year and then sticks", async () => {
    const mem = new Map<string, string>();
    const kv = { get: async (k: string) => mem.get(k) ?? null, put: async (k: string, v: string) => void mem.set(k, v) } as unknown as KVNamespace;
    expect(await activeYear(kv, "2026-11-13")).toBe("2026");
    expect(await activeYear(kv, "2027-01-02")).toBe("2026"); // not closed yet
  });
});

describe("closing a year", () => {
  const ms = (id: string, status: string): GoalOut => g(id, status, { kind: "Milestone" });
  const goals = [g("done", "Done"), g("open", "In progress", { children: [ms("m1", "Done"), ms("m2", "Not started"), ms("m3", "Archived")] }), g("arch", "Archived")];

  it("carries the chosen unfinished goals with their open milestones", () => {
    const plan = planClose(goals, "2026", "2026", ["open"]);
    expect(plan.next).toBe("2027");
    expect(plan.carry).toHaveLength(1);
    expect(plan.carry[0].milestones.map((m) => m.id)).toEqual(["m2"]);
  });
  it("allows carrying nothing", () => {
    expect(planClose(goals, "2026", "2026", []).carry).toEqual([]);
  });
  it("refuses other years, finished or archived goals", () => {
    expect(() => planClose(goals, "2025", "2026", [])).toThrow(InvalidClose);
    expect(() => planClose(goals, "2026", "2026", ["done"])).toThrow(InvalidClose);
    expect(() => planClose(goals, "2026", "2026", ["arch"])).toThrow(InvalidClose);
    expect(() => planClose(goals, "2026", "2026", "open")).toThrow(InvalidClose);
  });
});

describe("year summary", () => {
  it("counts done goals and averages progress per area, ignoring archived ones", () => {
    const s = summarizeYear([g("a", "Done"), g("b", "In progress", { progress: 0.5 }), g("c", "Archived"), g("d", "Done", { area: "Apolo" })], ["Travel", "Apolo", "Career & Code"]);
    expect(s.done).toBe(2);
    expect(s.total).toBe(3);
    expect(s.areas[0]).toEqual({ area: "Travel", done: 1, total: 2, progress: 0.75 });
    expect(s.areas[2]).toEqual({ area: "Career & Code", done: 0, total: 0, progress: null });
  });
});
