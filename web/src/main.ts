import "./styles.css";
import { api, getToken, LockedError, setToken, type Goal, type Habit, type HabitStats, type Summary } from "./api";
import { WEATHER } from "./config";
import { startStars } from "./stars";

type Tab = "today" | "habits" | "year";
const TABS: Tab[] = ["today", "habits", "year"];
const WIDE = window.matchMedia("(min-width: 1024px)");
const CACHE_KEY = "p303.summary";
const TAB_KEY = "p303.tab";
const REFRESH_MS = 5 * 60_000;

const store = {
  get<T>(k: string): T | null { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const state = {
  tab: (TABS.includes(store.get<Tab>(TAB_KEY)!) ? store.get<Tab>(TAB_KEY)! : "today") as Tab,
  data: store.get<Summary>(CACHE_KEY),
  weather: null as null | { temp: number; text: string; max: number; min: number },
  loading: false,
  locked: !getToken(),
  lockError: "",
};

const app = document.getElementById("app")!;
startStars(document.getElementById("stars") as HTMLCanvasElement);

// ---------- helpers ----------
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const pct = (v: number) => `${Math.round(v * 100)}%`;
let toastTimer: number | undefined;
function toast(msg: string) {
  let t = document.querySelector<HTMLDivElement>(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t!.hidden = true), 2200);
}
function greeting() {
  const h = new Date().getHours();
  return h < 6 ? "Good night" : h < 12 ? "Good morning" : h < 20 ? "Good afternoon" : "Good evening";
}
function yearProgress() {
  const n = new Date(), s = new Date(n.getFullYear(), 0, 1), e = new Date(n.getFullYear() + 1, 0, 1);
  return (n.getTime() - s.getTime()) / (e.getTime() - s.getTime());
}
const shortDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

const ICONS = {
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M5 19l1.4-1.4M17.6 6.4 19 5"/></svg>',
  habits: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3c2 3 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-7.5z"/></svg>',
  year: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.8z"/></svg>',
  refresh: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>',
};

// ---------- data ----------
async function refresh(manual = false) {
  if (state.locked || state.loading) return;
  state.loading = true;
  render();
  try {
    state.data = await api.summary();
    store.set(CACHE_KEY, state.data);
    if (manual) toast("Updated");
  } catch (e) {
    if (e instanceof LockedError) { state.locked = true; }
    else toast(navigator.onLine ? (e as Error).message : "Offline: showing the last saved data");
  } finally {
    state.loading = false;
    render();
  }
}

async function loadWeather() {
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${WEATHER.lat}&longitude=${WEATHER.lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=Europe%2FMadrid&forecast_days=1`;
    const r = await (await fetch(u)).json();
    state.weather = { temp: Math.round(r.current.temperature_2m), text: weatherText(r.current.weather_code), max: Math.round(r.daily.temperature_2m_max[0]), min: Math.round(r.daily.temperature_2m_min[0]) };
    render();
  } catch { /* the chip just stays hidden */ }
}
function weatherText(c: number) {
  if (c === 0) return "Clear";
  if (c <= 2) return "Partly cloudy";
  if (c === 3) return "Cloudy";
  if (c <= 48) return "Fog";
  if (c <= 57) return "Drizzle";
  if (c <= 67) return "Rain";
  if (c <= 77) return "Snow";
  if (c <= 82) return "Showers";
  return "Storm";
}

// ---------- views ----------
function render() {
  if (state.locked) { app.innerHTML = lockView(); bindLock(); return; }
  const d = state.data;
  const date = new Date();
  app.innerHTML = `
  <div class="app">
    <header>
      <div>
        <div class="eyebrow">${date.toLocaleDateString("en-GB", { weekday: "long" })} · ${date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>
        <h1>${greeting()}, <span class="g">303</span></h1>
      </div>
      <button class="icon-btn ${state.loading ? "spin" : ""}" data-act="refresh" aria-label="Refresh">${ICONS.refresh}</button>
    </header>
    <div class="chips">
      ${state.weather ? `<span class="chip">${WEATHER.city} · ${state.weather.temp}° · ${state.weather.text} · ${state.weather.min}°/${state.weather.max}°</span>` : ""}
      ${WIDE.matches ? `<span class="chip num">${date.getFullYear()} · ${(yearProgress() * 100).toFixed(1)}% of the year</span>` : ""}
    </div>
    ${!d ? `<div class="card"><div class="empty">${state.loading ? "Loading your day…" : "No data yet. Pull to refresh with the button above."}</div></div>` : WIDE.matches ? dashboard(d) : view(d)}
  </div>
  ${WIDE.matches ? "" : `<nav class="tabs" aria-label="Sections"><div class="in" role="tablist">
    ${TABS.map((t) => `<button role="tab" data-tab="${t}" aria-selected="${state.tab === t}">${ICONS[t]}${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}
  </div></nav>`}`;
  document.body.classList.toggle("wide", WIDE.matches);
}

/** Desktop: everything on one screen. Habits on the wide column, the day and the year on the side. */
function dashboard(d: Summary) {
  return `<div class="dash">
    <section class="stack">${habitsCard(d)}</section>
    <section class="stack">${top3Card(d)}${agendaCard(d)}${goalsCard(d)}</section>
  </div>`;
}

function view(d: Summary) {
  switch (state.tab) {
    case "today": return todayView(d);
    case "habits": return habitsView(d);
    case "year": return yearView(d);
  }
}

const errorCard = (title: string, error: string) => `<div class="card"><div class="card-h"><h2>${title}</h2></div><div class="err">${esc(error)}</div></div>`;

function todayView(d: Summary) {
  const yp = yearProgress();
  let html = `<section class="stack">
    <div class="card"><div class="card-h"><h2>${new Date().getFullYear()}</h2><span class="meta num">${(yp * 100).toFixed(1)}% of the year</span></div>
      <div class="bar grad"><i style="width:${(yp * 100).toFixed(1)}%"></i></div></div>`;

  html += top3Card(d) + agendaCard(d);

  // Habits today
  if (d.habits.ok) {
    const hs = d.habits.data.habits;
    const can = d.habits.data.hasTodayRow;
    html += `<div class="card"><div class="card-h"><h2>Habits today</h2><span class="meta num">${hs.filter((h) => h.doneToday).length} / ${hs.length}</span></div>
      ${can ? "" : `<div class="err" style="margin-bottom:10px">There is no row for today in the Habit Tracker yet.</div>`}
      <div class="habit-grid">${hs.map((h) => `<button type="button" class="hbtn" data-habit="${esc(h.prop)}" aria-pressed="${h.doneToday}" ${can ? "" : "disabled"} style="--c:${look(h).c}"><span class="tick"></span><span>${esc(h.label)}</span></button>`).join("")}</div></div>`;
  } else html += errorCard("Habits today", d.habits.error);

  return html + `</section>`;
}

function top3Card(d: Summary) {
  let html = "";
  if (d.top3.ok) {
    const list = d.top3.data;
    html += `<div class="card"><div class="card-h"><h2>Top 3 today</h2><span class="meta">${list.filter((p) => p.done).length} of ${list.length} done</span></div>
      ${list.length ? list.map((p) => `<button type="button" class="prio" data-prio="${p.id}" aria-pressed="${p.done}"><b>${p.order}</b><span>${esc(p.name)}</span></button>`).join("") : `<div class="empty">No priorities for today yet.</div>`}
      ${list.length < 3 ? `<form class="add-row" data-form="prio"><input id="prio-input" name="name" placeholder="Add a priority" autocomplete="off" maxlength="200"><button class="btn" type="submit">Add</button></form>` : ""}
    </div>`;
  } else html += errorCard("Top 3 today", d.top3.error);
  return html;
}

function agendaCard(d: Summary) {
  let html = "";
  if (d.agenda.ok) {
    const { items, upcoming, scheduleOk } = d.agenda.data;
    html += `<div class="card"><div class="card-h"><h2>Agenda</h2><span class="meta">${items.length ? `${items.length} today` : "Free day"}</span></div>
      ${items.length ? items.map((i) => `<div class="agenda-row"><time class="num">${i.start ?? "All day"}</time><div>${esc(i.title)}<div class="tag ${i.kind === "Exam" ? "exam" : ""}">${i.kind}${i.end ? ` · until ${i.end}` : ""}</div></div></div>`).join("") : `<div class="empty">Nothing scheduled today.</div>`}
      ${!scheduleOk ? `<div class="err" style="margin-top:8px">Couldn't read the class schedule from Notion.</div>` : ""}
      ${upcoming.length ? `<div class="divider" style="margin:12px 0 6px"></div><div class="eyebrow" style="margin-bottom:4px">Coming up</div>${upcoming.map((u) => `<div class="agenda-row"><time class="num">${shortDate(u.date).split(" ").slice(1).join(" ")}</time><div>${esc(u.title)}<div class="tag ${u.kind === "Exam" ? "exam" : ""}">${u.kind}</div></div></div>`).join("")}` : ""}
    </div>`;
  } else html += errorCard("Agenda", d.agenda.error);
  return html;
}

// One colour and icon per habit, all within the blue range.
const I = {
  sun: '<path d="M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4"/><circle cx="12" cy="12" r="3.5"/>',
  pill: '<rect x="4" y="9" width="16" height="6" rx="3" transform="rotate(-35 12 12)"/><path d="m9.5 8.5 5 7"/>',
  dumb: '<path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/>',
  paw: '<circle cx="7" cy="9" r="1.6"/><circle cx="12" cy="6.5" r="1.6"/><circle cx="17" cy="9" r="1.6"/><path d="M8 16c0-2.5 1.8-4.5 4-4.5s4 2 4 4.5-2 2.5-4 2.5-4 0-4-2.5z"/>',
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12"/>',
  leaf: '<path d="M5 19c0-8 6-13 14-13 0 8-5 14-13 14"/><path d="M5 19 13 11"/>',
  spine: '<path d="M12 3v18M9 6h6M8.5 10h7M9 14h6M9.5 18h5"/>',
  moon: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
  drop: '<path d="M12 3.5s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 1.5 1 2.5 2.5 3-.5-3 0-5.5 0-8z"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
};
const svg = (p: string, sw = 1.7) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const LOOK: Record<string, { c: string; i: keyof typeof I }> = {
  "AM skincare": { c: "#7fe3ff", i: "sun" },
  "Creatine": { c: "#5bc8ff", i: "pill" },
  "Gym": { c: "#5b9dff", i: "dumb" },
  "Apolo walk": { c: "#4fd3e6", i: "paw" },
  "Code": { c: "#7f9cff", i: "code" },
  "healthy meal": { c: "#8cc4ff", i: "leaf" },
  "Posture": { c: "#6d7dff", i: "spine" },
  "Night shower + read": { c: "#9a8cff", i: "moon" },
  "PM Skincare": { c: "#b3d4ff", i: "drop" },
};
const look = (h: Habit) => LOOK[h.prop] ?? { c: "#5b9dff", i: "check" as const };
const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const HEAT = ["#0a1f45", "#173d7a", "#2f6fe4", "#5b9dff", "#87ceff"]; // last one = perfect day (sky blue)

function addDaysISO(d: string, n: number) {
  const x = new Date(d + "T12:00:00Z");
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

function habitsCard(d: Summary) {
  if (!d.habits.ok) return errorCard("Habits", d.habits.error);
  const { habits: hs, weekHasRow, stats } = d.habits.data;
  const todayIdx = (new Date(d.today + "T12:00:00").getDay() + 6) % 7;
  const monday = addDaysISO(d.today, -todayIdx);
  const doneToday = hs.filter((h) => h.doneToday).length;
  const rows = hs.map((h) => {
    const { c, i } = look(h);
    const best = h.streak > 0 && h.streak >= h.best;
    const days = h.week.map((v, k) => {
      const label = `${h.label}, ${WEEKDAYS[k]}`;
      if (v === null) return `<span class="day future" aria-hidden="true"></span>`;
      const can = weekHasRow ? weekHasRow[k] : k === todayIdx;
      return `<button type="button" class="day ${v ? "on" : ""} ${k === todayIdx ? "today" : ""}" data-day="${esc(h.prop)}" data-date="${addDaysISO(monday, k)}" aria-pressed="${v}" aria-label="${esc(label)}" ${can ? "" : "disabled"}>${v ? svg(I.check, 3) : ""}</button>`;
    }).join("");
    return `<div class="hrow2" style="--c:${c}">
      <div class="hname"><span class="ico">${svg(I[i])}</span><div><b>${esc(h.label)}</b><small class="${best ? "best" : ""}">${best ? "Your best streak!" : `Best: ${h.best} ${h.best === 1 ? "day" : "days"} · ${h.weekCount}/${h.target} this week`}</small></div></div>
      <div class="days">${days}</div>
      <div class="hstreak num" title="Current streak">${svg(I.flame, 1.8)}${h.streak}</div>
    </div>`;
  }).join("");
  return `<div class="card habits-card">
    <div class="card-h"><h2>Habits</h2><span class="pill num">${doneToday} of ${hs.length} today</span></div>
    <div class="hrow2 head"><span></span><div class="days">${DAYS.map((x, k) => `<span class="${k === todayIdx ? "today" : ""}">${x}</span>`).join("")}</div><span class="meta" style="text-align:right">Streak</span></div>
    ${rows}
    ${stats ? statsBlock(stats, hs.length, d.today) : ""}
  </div>`;
}

function statsBlock(s: HabitStats, count: number, today: string) {
  const level = (n: number | null) => n === null ? -1 : n === 0 ? 0 : n >= count ? 4 : Math.min(3, 1 + Math.floor((n / count) * 3));
  const cells = s.days.map((x) => {
    const l = level(x.done);
    const title = x.done === null ? "" : `${x.date}: ${x.done} of ${count}`;
    return `<i class="${x.date === today ? "t" : ""}" style="background:${l < 0 ? "transparent" : HEAT[l]}" title="${title}"></i>`;
  }).join("");
  return `<div class="lower">
    <div>
      <div class="hm-h"><span class="meta">Last 20 weeks</span><span class="legend">Less ${HEAT.map((c) => `<i style="background:${c}"></i>`).join("")} Perfect</span></div>
      <div class="hm" role="img" aria-label="Habits completed per day over the last 20 weeks">${cells}</div>
    </div>
    <div class="stats">
      <div class="stat"><span>Done this month</span><b class="num">${Math.round(s.monthRate * 100)}<small>%</small></b></div>
      <div class="stat"><span>Perfect days</span><b class="num">${s.perfectDays}<small> ${s.perfectDays === 1 ? "day" : "days"}</small></b></div>
      <div class="stat"><span>Best day</span><b>${s.bestWeekday === null ? "–" : WEEKDAYS[s.bestWeekday]}</b></div>
    </div>
  </div>`;
}

function habitsView(d: Summary) {
  return `<section class="stack">${habitsCard(d)}</section>`;
}

function goalRow(g: Goal): string {
  const done = g.status === "Done";
  const right = done ? `<span class="pill ok">Done</span>`
    : g.progress !== null ? `<span class="meta num">${pct(g.progress)}</span>`
    : `<span class="pill">${esc(g.status)}</span>`;
  const bar = g.progress !== null && !done ? `<div class="bar"><i style="width:${pct(g.progress)}"></i></div>` : "";
  const subs = g.children.filter((c) => c.kind === "Sub-goal");
  const steps = g.children.filter((c) => c.kind !== "Sub-goal");
  return `<div class="goal">
    <div class="goal-h"><span>${esc(g.name)}</span>${right}</div>${bar}
    ${steps.length ? `<div class="ms">${steps.map((m) => `<button type="button" data-goal="${m.id}" aria-pressed="${m.status === "Done"}">${esc(m.name)}</button>`).join("")}</div>` : ""}
    ${subs.map((s) => `<div class="sub">↳ ${esc(s.name)} ${s.status === "Done" ? "· done" : s.progress !== null ? `· ${pct(s.progress)}` : ""}</div>
      ${s.children.length ? `<div class="ms">${s.children.map((m) => `<button type="button" data-goal="${m.id}" aria-pressed="${m.status === "Done"}">${esc(m.name)}</button>`).join("")}</div>` : ""}`).join("")}
  </div>`;
}

function goalsCard(d: Summary) {
  if (!d.goals.ok) return errorCard("Goals", d.goals.error);
  const gs = d.goals.data;
  return `<div class="card"><div class="card-h"><h2>${d.today.slice(0, 4)} goals</h2><span class="meta">${gs.filter((g) => g.status === "Done").length} of ${gs.length} done</span></div>
    ${gs.length ? gs.map(goalRow).join("") : `<div class="empty">No goals for this year in Notion yet.</div>`}
    <div class="meta" style="margin-top:8px">Tap a milestone to mark it done.</div></div>`;
}

function yearView(d: Summary) {
  return `<section class="stack">${goalsCard(d)}</section>`;
}

function lockView() {
  return `<div class="app"><div class="lock"><form data-form="pin">
    <div><div class="eyebrow">Life panel</div><h1><span class="g">303</span></h1></div>
    <input id="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="current-password" aria-label="PIN" placeholder="PIN" maxlength="12">
    ${state.lockError ? `<div class="err">${esc(state.lockError)}</div>` : ""}
    <button class="btn" type="submit">Unlock</button>
  </form></div></div>`;
}

function bindLock() {
  const form = app.querySelector<HTMLFormElement>("[data-form=pin]")!;
  const input = form.querySelector<HTMLInputElement>("#pin")!;
  input.focus();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const { token } = await api.login(input.value.trim());
      setToken(token);
      state.locked = false;
      state.lockError = "";
      render();
      refresh();
    } catch (err) {
      state.lockError = (err as Error).message;
      render();
    }
  });
}

// ---------- interactions (event delegation) ----------
app.addEventListener("click", async (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("button");
  if (!el || !state.data) {
    if (el?.dataset.act === "refresh") refresh(true);
    return;
  }
  const d = state.data;

  if (el.dataset.tab) {
    state.tab = el.dataset.tab as Tab;
    store.set(TAB_KEY, state.tab);
    render();
    scrollTo(0, 0);
    return;
  }
  if (el.dataset.act === "refresh") return refresh(true);

  if (el.dataset.habit && d.habits.ok) {
    const h = d.habits.data.habits.find((x) => x.prop === el.dataset.habit)!;
    const done = !h.doneToday;
    h.doneToday = done; // optimistic
    const ti = (new Date(d.today + "T12:00:00").getDay() + 6) % 7;
    h.week[ti] = done;
    render();
    try {
      await api.setHabit(h.prop, done);
      await refresh(); // streaks are recomputed on the server
    } catch (err) {
      h.doneToday = !done;
      h.week[ti] = !done;
      render();
      toast((err as Error).message);
    }
    return;
  }

  if (el.dataset.day && el.dataset.date && d.habits.ok) {
    const h = d.habits.data.habits.find((x) => x.prop === el.dataset.day)!;
    const k = (new Date(el.dataset.date + "T12:00:00").getDay() + 6) % 7;
    const done = !h.week[k];
    const isToday = el.dataset.date === d.today;
    h.week[k] = done; // optimistic
    if (isToday) h.doneToday = done;
    render();
    try {
      await api.setHabit(h.prop, done, el.dataset.date);
      await refresh(); // streaks and stats are recomputed on the server
    } catch (err) {
      h.week[k] = !done;
      if (isToday) h.doneToday = !done;
      render();
      toast((err as Error).message);
    }
    return;
  }

  if (el.dataset.prio && d.top3.ok) {
    const p = d.top3.data.find((x) => x.id === el.dataset.prio)!;
    p.done = !p.done;
    render();
    try { await api.setPriority(p.id, p.done); store.set(CACHE_KEY, d); }
    catch (err) { p.done = !p.done; render(); toast((err as Error).message); }
    return;
  }

  if (el.dataset.goal) {
    const done = el.getAttribute("aria-pressed") !== "true";
    el.setAttribute("aria-pressed", String(done));
    try { await api.setGoal(el.dataset.goal, done ? "Done" : "Not started"); await refresh(); }
    catch (err) { el.setAttribute("aria-pressed", String(!done)); toast((err as Error).message); }
  }
});

app.addEventListener("submit", async (e) => {
  const form = e.target as HTMLFormElement;
  if (form.dataset.form !== "prio") return;
  e.preventDefault();
  const input = form.querySelector<HTMLInputElement>("input")!;
  const name = input.value.trim();
  if (!name) return;
  input.disabled = true;
  try { await api.addPriority(name); await refresh(); }
  catch (err) { input.disabled = false; toast((err as Error).message); }
});

// ---------- lifecycle ----------
document.addEventListener("visibilitychange", () => { if (!document.hidden) { refresh(); loadWeather(); } });
setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js").catch(() => {});
}

WIDE.addEventListener("change", () => render());
render();
loadWeather();
refresh();
