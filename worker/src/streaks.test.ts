import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { computeStreak } from "./streaks";

// 2026-10-05 is a Monday.
const MON = "2026-10-05";
const days = (start: string, offsets: number[]) => new Set(offsets.map((o) => addDays(start, o)));

describe("streak rule", () => {
  it("daily habit: consecutive days count, today unchecked does not break it", () => {
    const r = computeStreak(days(MON, [0, 1, 2]), 7, MON, addDays(MON, 3));
    expect(r.streak).toBe(3);
  });

  it("daily habit: one missed day breaks it", () => {
    const r = computeStreak(days(MON, [0, 1, 3]), 7, MON, addDays(MON, 4));
    expect(r.streak).toBe(1);
  });

  it("gym (4/week): 3 skipped days in a row keep the streak", () => {
    const r = computeStreak(days(MON, [0, 1, 5]), 4, MON, addDays(MON, 5));
    expect(r.streak).toBe(3);
  });

  it("gym (4/week): 4 skipped days in a row break it", () => {
    const r = computeStreak(days(MON, [0, 1, 6]), 4, MON, addDays(MON, 6));
    expect(r.streak).toBe(1);
  });

  it("weekly minimum: a closed week below target breaks the streak", () => {
    // 5/week habit: Mon Wed Fri Sun only 4 days, gaps of 1 → allowed by gap rule, but week has 4 < 5.
    const r = computeStreak(days(MON, [0, 2, 4, 6]), 5, MON, addDays(MON, 7));
    expect(r.streak).toBe(0);
  });

  it("weekly minimum: the current week is not judged before Sunday ends", () => {
    const r = computeStreak(days(MON, [0, 2, 4, 6]), 5, MON, addDays(MON, 6));
    expect(r.streak).toBe(4);
    expect(r.weekCount).toBe(4);
  });

  it("week met carries the streak into the next week", () => {
    const r = computeStreak(days(MON, [0, 1, 2, 3, 4, 7]), 5, MON, addDays(MON, 7));
    expect(r.streak).toBe(6);
    expect(r.weeksMet).toBe(1);
  });

  it("restarts at 1 after a break", () => {
    const r = computeStreak(days(MON, [0, 1, 9, 10]), 7, MON, addDays(MON, 10));
    expect(r.streak).toBe(2);
    expect(r.best).toBe(2);
  });

  it("current week dots stop at today", () => {
    const r = computeStreak(days(MON, [0, 2]), 5, MON, addDays(MON, 2));
    expect(r.week).toEqual([true, false, true, null, null, null, null]);
  });
});
