import { addDays, mondayOf, weekday } from "./dates";

export const HEATMAP_WEEKS = 20;

export interface DayCount { date: string; done: number | null }
export interface HabitStats {
  /** Last 20 weeks, Monday first, ending on the Sunday of the current week. Days after today are null. */
  days: DayCount[];
  /** Checked habits / possible habits this month, up to and including today (0..1). */
  monthRate: number;
  /** Days this month (up to today) with every habit checked. */
  perfectDays: number;
  /** 0 = Monday … 6 = Sunday: weekday with the highest completion over the heatmap's past days. Null without data. */
  bestWeekday: number | null;
}

/** `doneByDate` maps a date to how many habits were checked that day. */
export function habitStats(doneByDate: Map<string, number>, habitCount: number, today: string): HabitStats {
  const start = addDays(mondayOf(today), -7 * (HEATMAP_WEEKS - 1));
  const days: DayCount[] = [];
  for (let i = 0; i < HEATMAP_WEEKS * 7; i++) {
    const d = addDays(start, i);
    days.push({ date: d, done: d > today ? null : doneByDate.get(d) ?? 0 });
  }

  const month = today.slice(0, 7);
  let checks = 0, possible = 0, perfectDays = 0;
  for (let d = `${month}-01`; d <= today; d = addDays(d, 1)) {
    const n = doneByDate.get(d) ?? 0;
    checks += n;
    possible += habitCount;
    if (habitCount > 0 && n >= habitCount) perfectDays += 1;
  }

  const sum = Array(7).fill(0), cnt = Array(7).fill(0);
  for (const { date, done } of days) {
    if (done === null || date === today) continue; // today is still in progress
    sum[weekday(date)] += done;
    cnt[weekday(date)] += 1;
  }
  let bestWeekday: number | null = null;
  let bestAvg = 0;
  for (let w = 0; w < 7; w++) {
    const avg = cnt[w] ? sum[w] / cnt[w] : 0;
    if (avg > bestAvg) { bestAvg = avg; bestWeekday = w; }
  }

  return { days, monthRate: possible ? checks / possible : 0, perfectDays, bestWeekday };
}
