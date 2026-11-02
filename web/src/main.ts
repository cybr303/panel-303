import "./styles.css";
import { api, getToken, LockedError, setToken, type Goal, type Habit, type Summary } from "./api";
import { WEATHER } from "./config";
import { startStars } from "./stars";

type Tab = "today" | "habits" | "money" | "year";
const CACHE_KEY = "p303.summary";
const TAB_KEY = "p303.tab";
const REFRESH_MS = 5 * 60_000;

const store = {
  get<T>(k: string): T | null { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const state = {
  tab: (store.get<Tab>(TAB_KEY) ?? "today") as Tab,
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
  money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18M16 15h2"/></svg>',
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
    ${state.weather ? `<div class="chips"><span class="chip">${WEATHER.city} · ${state.weather.temp}° · ${state.weather.text} · ${state.weather.min}°/${state.weather.max}°</span></div>` : ""}
    ${!d ? `<div class="card"><div class="empty">${state.loading ? "Loading your day…" : "No data yet. Pull to refresh with the button above."}</div></div>` : view(d)}
  </div>
  <nav class="tabs" aria-label="Sections"><div class="in" role="tablist">
    ${(["today", "habits", "money", "year"] as Tab[]).map((t) => `<button role="tab" data-tab="${t}" aria-selected="${state.tab === t}">${ICONS[t]}${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}
  </div></nav>`;
}

function view(d: Summary) {
  switch (state.tab) {
    case "today": return todayView(d);
    case "habits": return habitsView(d);
    case "money": return moneyView();
    case "year": return yearView(d);
  }
}

const errorCard = (title: string, error: string) => `<div class="card"><div class="card-h"><h2>${title}</h2></div><div class="err">${esc(error)}</div></div>`;

function todayView(d: Summary) {
  const yp = yearProgress();
  let html = `<section class="stack">
    <div class="card"><div class="card-h"><h2>${new Date().getFullYear()}</h2><span class="meta num">${(yp * 100).toFixed(1)}% of the year</span></div>
      <div class="bar grad"><i style="width:${(yp * 100).toFixed(1)}%"></i></div></div>`;

  // Top 3
  if (d.top3.ok) {
    const list = d.top3.data;
    html += `<div class="card"><div class="card-h"><h2>Top 3 today</h2><span class="meta">${list.filter((p) => p.done).length} of ${list.length} done</span></div>
      ${list.length ? list.map((p) => `<button type="button" class="prio" data-prio="${p.id}" aria-pressed="${p.done}"><b>${p.order}</b><span>${esc(p.name)}</span></button>`).join("") : `<div class="empty">No priorities for today yet.</div>`}
      ${list.length < 3 ? `<form class="add-row" data-form="prio"><input id="prio-input" name="name" placeholder="Add a priority" autocomplete="off" maxlength="200"><button class="btn" type="submit">Add</button></form>` : ""}
    </div>`;
  } else html += errorCard("Top 3 today", d.top3.error);

  // Agenda
  if (d.agenda.ok) {
    const { items, upcoming, scheduleOk } = d.agenda.data;
    html += `<div class="card"><div class="card-h"><h2>Agenda</h2><span class="meta">${items.length ? `${items.length} today` : "Free day"}</span></div>
      ${items.length ? items.map((i) => `<div class="agenda-row"><time class="num">${i.start ?? "All day"}</time><div>${esc(i.title)}<div class="tag ${i.kind === "Exam" ? "exam" : ""}">${i.kind}${i.end ? ` · until ${i.end}` : ""}</div></div></div>`).join("") : `<div class="empty">Nothing scheduled today.</div>`}
      ${!scheduleOk ? `<div class="err" style="margin-top:8px">Couldn't read the class schedule from Notion.</div>` : ""}
      ${upcoming.length ? `<div class="divider" style="margin:12px 0 6px"></div><div class="eyebrow" style="margin-bottom:4px">Coming up</div>${upcoming.map((u) => `<div class="agenda-row"><time class="num">${shortDate(u.date).split(" ").slice(1).join(" ")}</time><div>${esc(u.title)}<div class="tag ${u.kind === "Exam" ? "exam" : ""}">${u.kind}</div></div></div>`).join("")}` : ""}
    </div>`;
  } else html += errorCard("Agenda", d.agenda.error);

  // Habits today
  if (d.habits.ok) {
    const hs = d.habits.data.habits;
    const can = d.habits.data.hasTodayRow;
    html += `<div class="card"><div class="card-h"><h2>Habits today</h2><span class="meta num">${hs.filter((h) => h.doneToday).length} / ${hs.length}</span></div>
      ${can ? "" : `<div class="err" style="margin-bottom:10px">There is no row for today in the Habit Tracker yet.</div>`}
      <div class="habit-grid">${hs.map((h) => `<button type="button" class="hbtn" data-habit="${esc(h.prop)}" aria-pressed="${h.doneToday}" ${can ? "" : "disabled"}><span class="tick"></span><span>${esc(h.label)}</span></button>`).join("")}</div></div>`;
  } else html += errorCard("Habits today", d.habits.error);

  return html + `</section>`;
}

function habitRule(h: Habit) {
  return h.target === 7 ? "Daily" : `${h.target}× week · skip up to ${7 - h.target} days in a row`;
}

function habitsView(d: Summary) {
  if (!d.habits.ok) return `<section class="stack">${errorCard("Habits", d.habits.error)}</section>`;
  const hs = d.habits.data.habits;
  const todayIdx = (new Date(d.today + "T12:00:00").getDay() + 6) % 7;
  return `<section class="stack"><div class="card"><div class="card-h"><h2>This week</h2><span class="meta">best streak in brackets</span></div>
    ${hs.map((h) => `<div class="hrow">
      <div><div>${esc(h.label)}</div><div class="rule">${habitRule(h)}</div></div>
      <div class="streak num">${h.streak}<small>${h.streak === 1 ? "day" : "days"}</small></div>
      <div class="dots">${h.week.map((v, i) => `<span class="${v ? "on" : v === null ? "future" : ""} ${i === todayIdx ? "today" : ""}"></span>`).join("")}</div>
      <div class="rule num">${h.weekCount} / ${h.target} this week</div>
      <div class="rule num" style="text-align:right">(${h.best})</div>
    </div>`).join("")}
  </div></section>`;
}

function moneyView() {
  return `<section class="stack"><div class="card"><div class="card-h"><h2>Money</h2><span class="pill">Phase 2</span></div>
    <div class="sub">Net worth, monthly budget, savings goal, upcoming charges and the + Add button arrive once the Excel is on OneDrive.</div></div></section>`;
}

function goalRow(g: Goal): string {
  const done = g.status === "Done";
  const right = done ? `<span class="pill ok">Done</span>`
    : g.progress !== null ? `<span class="meta num">${pct(g.progress)}</span>`
    : g.tracking === "Money" ? `<span class="pill">Phase 2</span>`
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

function yearView(d: Summary) {
  if (!d.goals.ok) return `<section class="stack">${errorCard("Goals", d.goals.error)}</section>`;
  const gs = d.goals.data;
  return `<section class="stack"><div class="card"><div class="card-h"><h2>${d.today.slice(0, 4)} goals</h2><span class="meta">${gs.filter((g) => g.status === "Done").length} of ${gs.length} done</span></div>
    ${gs.length ? gs.map(goalRow).join("") : `<div class="empty">No goals for this year in Notion yet.</div>`}
    <div class="meta" style="margin-top:8px">Tap a milestone to mark it done.</div></div></section>`;
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
    render();
    try {
      await api.setHabit(h.prop, done);
      await refresh(); // streaks are recomputed on the server
    } catch (err) {
      h.doneToday = !done;
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

render();
loadWeather();
refresh();
