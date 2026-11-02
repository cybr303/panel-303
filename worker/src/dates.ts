// Dates are handled as "YYYY-MM-DD" strings in the user's time zone.

export function todayIn(tz: string, now = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function toUTC(d: string): Date {
  return new Date(d + "T00:00:00Z");
}

export function addDays(d: string, n: number): string {
  const x = toUTC(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday */
export function weekday(d: string): number {
  return (toUTC(d).getUTCDay() + 6) % 7;
}

export function mondayOf(d: string): string {
  return addDays(d, -weekday(d));
}
