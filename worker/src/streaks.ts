import { addDays, mondayOf, weekday } from "./dates";

/**
 * Streak rule approved by 303 (see CLAUDE.md):
 * 1. The streak counts checked days; checking today adds 1.
 * 2. At most `7 - target` unchecked days in a row are allowed; one more breaks it.
 * 3. A closed week (Mon–Sun) that ends below `target` breaks it.
 * 4. The current week is only judged by rule 3 once Sunday is over.
 * 5. After a break, the next checked day starts again at 1.
 * Today, while still unchecked, never counts as a missed day.
 */
export interface StreakResult {
  streak: number;
  best: number;
  /** Checked days this week (Mon–Sun containing `today`). */
  weekCount: number;
  /** Mon..Sun of the current week; null for days after today. */
  week: (boolean | null)[];
  /** Consecutive closed weeks (most recent first) that met the target, plus the current one if already met. */
  weeksMet: number;
}

export function computeStreak(checked: Set<string>, target: number, from: string, today: string): StreakResult {
  const maxGap = 7 - target;
  let streak = 0;
  let best = 0;
  let gap = 0;
  let weekCount = 0;
  let weeksMet = 0;
  // The first, possibly partial, week of history is never judged by the weekly minimum.
  const firstFullMonday = weekday(from) === 0 ? from : addDays(mondayOf(from), 7);

  for (let d = from; d <= today; d = addDays(d, 1)) {
    if (weekday(d) === 0) weekCount = 0;
    const on = checked.has(d);
    if (on) {
      streak += 1;
      gap = 0;
      weekCount += 1;
    } else if (d !== today) {
      gap += 1;
      if (gap > maxGap) streak = 0;
    }
    // End of a closed week: apply the weekly minimum.
    if (weekday(d) === 6 && d !== today && d >= addDays(firstFullMonday, 6)) {
      if (weekCount < target) {
        streak = 0;
        weeksMet = 0;
      } else {
        weeksMet += 1;
      }
    }
    if (streak > best) best = streak;
  }

  const monday = mondayOf(today);
  const week: (boolean | null)[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    week.push(d > today ? null : checked.has(d));
  }
  const currentMet = weekCount >= target ? 1 : 0;
  return { streak, best, weekCount, week, weeksMet: weeksMet + currentMet };
}
