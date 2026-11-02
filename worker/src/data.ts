import { DS, HABITS, HISTORY_DAYS, SCHOOL_PAGE } from "./config";
import { addDays, mondayOf, weekday } from "./dates";
import { Block, Notion, Page, checkbox, dateStart, num, relationIds, richTextPlain, select, text } from "./notion";
import { habitStats } from "./stats";
import { computeStreak, StreakResult } from "./streaks";

// ---------- Habits ----------
export interface HabitOut extends StreakResult {
  prop: string;
  label: string;
  target: number;
  doneToday: boolean;
}

export async function getHabits(n: Notion, today: string) {
  const from = addDays(today, -HISTORY_DAYS);
  const rows = await n.query(DS.habits, {
    filter: { and: [
      { property: "Date", date: { on_or_after: from } },
      { property: "Date", date: { on_or_before: today } },
    ] },
    sorts: [{ property: "Date", direction: "ascending" }],
  });
  const todayRow = rows.find((r) => dateStart(r.properties.Date)?.slice(0, 10) === today) ?? null;
  const doneByDate = new Map<string, number>();
  for (const r of rows) {
    const d = dateStart(r.properties.Date)?.slice(0, 10);
    if (d) doneByDate.set(d, HABITS.filter((h) => checkbox(r.properties[h.prop])).length);
  }
  const weekStart = mondayOf(today);
  const weekRows = new Set(rows.map((r) => dateStart(r.properties.Date)?.slice(0, 10)).filter((d): d is string => !!d && d >= weekStart));
  const habits: HabitOut[] = HABITS.map((h) => {
    const checked = new Set<string>();
    for (const r of rows) {
      const d = dateStart(r.properties.Date)?.slice(0, 10);
      if (d && checkbox(r.properties[h.prop])) checked.add(d);
    }
    const s = computeStreak(checked, h.target, from, today);
    return { ...h, ...s, doneToday: checked.has(today) };
  });
  // Mon..Sun of this week: whether a Habit Tracker row exists to be marked.
  const weekHasRow = Array.from({ length: 7 }, (_, i) => weekRows.has(addDays(weekStart, i)));
  return { habits, todayRowId: todayRow?.id ?? null, weekHasRow, stats: habitStats(doneByDate, HABITS.length, today) };
}

/** Marks a habit on today or an earlier day of the current week. Never creates rows. */
export async function setHabit(n: Notion, today: string, prop: string, done: boolean, date = today) {
  if (!HABITS.some((h) => h.prop === prop)) throw new BadRequest("Unknown habit");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today || date < mondayOf(today))
    throw new BadRequest("Only days of this week up to today can be marked");
  const rows = await n.query(DS.habits, { filter: { property: "Date", date: { equals: date } } });
  if (!rows[0]) throw new BadRequest(`There is no row for ${date} in the Habit Tracker`);
  await n.updatePage(rows[0].id, { [prop]: { checkbox: done } });
}

// ---------- Top 3 ----------
export interface PriorityOut { id: string; name: string; order: number; done: boolean }

export async function getTop3(n: Notion, today: string): Promise<PriorityOut[]> {
  const rows = await n.query(DS.top3, { filter: { property: "Date", date: { equals: today } } });
  return rows
    .map((r) => ({
      id: r.id,
      name: text(r.properties.Name),
      order: Number(select(r.properties.Order) ?? 9),
      done: checkbox(r.properties.Done),
    }))
    .sort((a, b) => a.order - b.order);
}

export async function setTop3Done(n: Notion, id: string, done: boolean) {
  await n.updatePage(id, { Done: { checkbox: done } });
}

export async function addTop3(n: Notion, today: string, name: string) {
  const current = await getTop3(n, today);
  if (current.length >= 3) throw new BadRequest("Today already has 3 priorities");
  const used = new Set(current.map((p) => p.order));
  const order = [1, 2, 3].find((o) => !used.has(o))!;
  await n.createPage(DS.top3, {
    Name: { title: [{ text: { content: name.slice(0, 200) } }] },
    Date: { date: { start: today } },
    Order: { select: { name: String(order) } },
  });
}

// ---------- Agenda ----------
export interface AgendaItem { start: string | null; end: string | null; title: string; kind: "Class" | "Event" | "Exam" | "Assignment"; detail?: string }

function localDateTime(iso: string, tz: string): { date: string; time: string | null } {
  if (iso.length <= 10) return { date: iso, time: null };
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return { date, time };
}

export async function getAgenda(n: Notion, today: string, tz: string) {
  const near = { and: [
    { property: "Date", date: { on_or_after: addDays(today, -1) } },
    { property: "Date", date: { on_or_before: addDays(today, 1) } },
  ] };
  const [events, tasks, classes] = await Promise.all([
    n.query(DS.calendar, { filter: near }),
    n.query(DS.assignments, { filter: { and: [
      { property: "Date", date: { on_or_after: addDays(today, -1) } },
      { property: "Date", date: { on_or_before: addDays(today, 14) } },
    ] } }),
    getSchedule(n).catch(() => null),
  ]);

  const items: AgendaItem[] = [];
  for (const e of events) {
    const s = dateStart(e.properties.Date);
    if (!s) continue;
    const a = localDateTime(s, tz);
    if (a.date !== today) continue;
    const endIso = e.properties.Date?.date?.end as string | null;
    items.push({ start: a.time, end: endIso ? localDateTime(endIso, tz).time : null, title: text(e.properties.Name), kind: "Event" });
  }

  const upcoming: { title: string; date: string; kind: "Exam" | "Assignment"; course?: string }[] = [];
  for (const t of tasks) {
    const s = dateStart(t.properties.Date);
    if (!s || select(t.properties.Status) === "Done") continue;
    const a = localDateTime(s, tz);
    if (a.date < today) continue;
    const kind = select(t.properties.Type) === "Exams" ? "Exam" : "Assignment";
    if (a.date === today) items.push({ start: a.time, end: null, title: text(t.properties.Name), kind });
    else upcoming.push({ title: text(t.properties.Name), date: a.date, kind });
  }

  const wd = weekday(today);
  if (classes && wd < 5) {
    // Merge consecutive slots of the same subject into one block.
    let last: AgendaItem | null = null;
    for (const slot of classes) {
      const subject = slot.days[wd];
      if (!subject || /^libre$/i.test(subject)) { last = null; continue; }
      if (last && last.title === subject && last.end === slot.start) { last.end = slot.end; continue; }
      last = { start: slot.start, end: slot.end, title: subject, kind: "Class" };
      items.push(last);
    }
  }

  items.sort((a, b) => (a.start ?? "00:00").localeCompare(b.start ?? "00:00"));
  upcoming.sort((a, b) => a.date.localeCompare(b.date));
  return { items, upcoming: upcoming.slice(0, 5), scheduleOk: classes !== null };
}

interface Slot { start: string; end: string; days: string[] }
let scheduleCache: { at: number; slots: Slot[] } | null = null;

/** Reads the "schedule" table on the "school" page. Cached for 30 minutes per worker instance. */
export async function getSchedule(n: Notion): Promise<Slot[]> {
  if (scheduleCache && Date.now() - scheduleCache.at < 30 * 60_000) return scheduleCache.slots;
  const table = await findScheduleTable(n, SCHOOL_PAGE, 0, { afterHeading: false });
  if (!table) throw new Error("Schedule table not found");
  const rows = await n.children(table.id);
  const cells = rows.filter((r) => r.type === "table_row").map((r) => (r.table_row.cells as any[][]).map(richTextPlain));
  const slots: Slot[] = [];
  for (const row of cells.slice(1)) {
    const m = row[0]?.match(/(\d{1,2})\s*[:.]\s*(\d{2})\s*[-–]\s*(\d{1,2})\s*[:.]\s*(\d{2})/);
    if (!m) continue;
    const pad = (h: string) => h.padStart(2, "0");
    slots.push({ start: `${pad(m[1])}:${m[2]}`, end: `${pad(m[3])}:${m[4]}`, days: row.slice(1, 6) });
  }
  scheduleCache = { at: Date.now(), slots };
  return slots;
}

async function findScheduleTable(n: Notion, blockId: string, depth: number, state: { afterHeading: boolean }): Promise<Block | null> {
  if (depth > 3) return null;
  const blocks = await n.children(blockId);
  let fallback: Block | null = null;
  for (const b of blocks) {
    if (b.type.startsWith("heading_")) {
      state.afterHeading = /schedule/i.test(richTextPlain(b[b.type].rich_text));
      continue;
    }
    if (b.type === "table") {
      if (state.afterHeading) return b;
      fallback ??= b;
      continue;
    }
    if (b.has_children && ["column_list", "column", "callout", "toggle", "synced_block"].includes(b.type)) {
      const found = await findScheduleTable(n, b.id, depth + 1, state);
      if (found) return found;
    }
  }
  return depth === 0 ? fallback : null;
}

// ---------- Goals ----------
export interface GoalOut {
  id: string;
  name: string;
  kind: string;
  status: string;
  tracking: string;
  habit: string | null;
  target: number | null;
  source: string;
  due: string | null;
  order: number;
  /** 0..1, or null when it is tracked by hand (Manual). */
  progress: number | null;
  children: GoalOut[];
}

export async function getGoals(n: Notion, year: string, habits: HabitOut[]): Promise<GoalOut[]> {
  const rows = await n.query(DS.goals, { filter: { property: "Year", select: { equals: year } } });
  const byId = new Map<string, GoalOut & { parent: string | null }>();
  for (const r of rows as Page[]) {
    const p = r.properties;
    byId.set(r.id, {
      id: r.id,
      name: text(p.Name),
      kind: select(p.Kind) ?? "Goal",
      status: select(p.Status) ?? "Not started",
      tracking: select(p.Tracking) ?? "Manual",
      habit: select(p.Habit),
      target: num(p.Target),
      source: text(p.Source),
      due: dateStart(p.Due),
      order: num(p.Order) ?? 99,
      progress: null,
      children: [],
      parent: relationIds(p.Parent)[0] ?? null,
    });
  }
  const roots: GoalOut[] = [];
  for (const g of byId.values()) {
    const parent = g.parent ? byId.get(g.parent) : undefined;
    (parent ? parent.children : roots).push(g);
  }
  const sortRec = (list: GoalOut[]) => { list.sort((a, b) => a.order - b.order); list.forEach((g) => sortRec(g.children)); };
  sortRec(roots);

  const measure = (g: GoalOut): void => {
    g.children.forEach(measure);
    if (g.status === "Done") { g.progress = 1; return; }
    if (g.tracking === "Milestones" && g.children.length) {
      g.progress = g.children.filter((c) => c.status === "Done" || c.progress === 1).length / g.children.length;
    } else if (g.tracking === "Habit" && g.habit && g.target) {
      const h = habits.find((x) => x.prop === g.habit);
      g.progress = h ? Math.min(1, h.weeksMet / g.target) : null;
    } else {
      // Manual goals show their status only.
      g.progress = null;
    }
  };
  roots.forEach(measure);
  // Drop the internal parent field
  const clean = (g: any): GoalOut => { delete g.parent; g.children.forEach(clean); return g; };
  return roots.map(clean);
}

export async function setGoalStatus(n: Notion, id: string, status: string) {
  if (!["Not started", "In progress", "Done"].includes(status)) throw new BadRequest("Unknown status");
  await n.updatePage(id, { Status: { status: { name: status } } });
}

export class BadRequest extends Error {}
