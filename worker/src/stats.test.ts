import { describe, expect, it } from "vitest";
import { habitStats } from "./stats";

describe("habit stats", () => {
  const today = "2026-11-04"; // Wednesday
  const done = new Map([
    ["2026-11-01", 9], // Sunday, previous month? no: November 1st
    ["2026-11-02", 9],
    ["2026-11-03", 4],
    ["2026-11-04", 2],
    ["2026-10-30", 9], // a Friday
    ["2026-10-23", 9], // another Friday
  ]);
  const s = habitStats(done, 9, today);

  it("covers 20 full weeks ending on this Sunday", () => {
    expect(s.days).toHaveLength(140);
    expect(s.days.at(-1)!.date).toBe("2026-11-08");
    expect(s.days[0].date).toBe("2026-06-22"); // a Monday
    expect(s.days.at(-1)!.done).toBeNull();
    expect(s.days.find((d) => d.date === today)!.done).toBe(2);
  });
  it("counts this month only, today included", () => {
    expect(s.perfectDays).toBe(2);
    expect(s.monthRate).toBeCloseTo((9 + 9 + 4 + 2) / 36);
  });
  it("picks the weekday with the best average, ignoring today", () => {
    expect(s.bestWeekday).toBe(4); // Friday
  });
});
