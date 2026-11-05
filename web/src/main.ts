import "./styles.css";
import { api, fetchPhoto, getToken, LockedError, setToken, type Goal, type Habit, type HabitStats, type LearningItem, type Photo, type Summary } from "./api";
import { WEATHER } from "./config";

// Phone: 3 tabs. Desktop (≥1024px): one dashboard with a sidebar that jumps between sections.
type Tab = "today" | "habits" | "life";
const TABS: Tab[] = ["today", "habits", "life"];
const WIDE = window.matchMedia("(min-width: 1024px)");
const CACHE_KEY = "p303.summary";
const TAB_KEY = "p303.tab";
const REFRESH_MS = 5 * 60_000;

/** Life areas, in the order they are shown. Names match the "Area" property in Notion. */
const AREAS = ["Health & Gym", "Career & Code", "Money & Home", "Apolo", "Travel", "Personal Growth"];

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

// ---------- helpers ----------
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const eur = (v: number) => `${String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}€`;
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
const monthYear = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { month: "short", year: "numeric" });
const clockNow = () => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
function addDaysISO(d: string, n: number) {
  const x = new Date(d + "T12:00:00Z");
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

const I = {
  grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  star: '<path d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.8z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  life: '<path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
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

// One colour and icon per habit, all within the blue range (one step darker so they read on light glass).
const LOOK: Record<string, { c: string; i: keyof typeof I }> = {
  "AM skincare": { c: "#1fb5e0", i: "sun" },
  "Creatine": { c: "#1a9be6", i: "pill" },
  "Gym": { c: "#2f6fe4", i: "dumb" },
  "Apolo walk": { c: "#14a8bd", i: "paw" },
  "Code": { c: "#5470e8", i: "code" },
  "healthy meal": { c: "#3d8fe0", i: "leaf" },
  "Posture": { c: "#4b55d6", i: "spine" },
  "Night shower + read": { c: "#7a63e6", i: "moon" },
  "PM Skincare": { c: "#5f8fd0", i: "drop" },
};
const look = (h: Habit) => LOOK[h.prop] ?? { c: "#2f6fe4", i: "check" as const };
const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const HEAT = ["#dbe6f5", "#a9c6f2", "#5b9dff", "#2f6fe4", "#87ceff"]; // last one = perfect day (sky blue)

// ---------- photos (fetched through the Worker, only after the PIN) ----------
const photoUrls = new Map<string, string>(); // key: id@version → blob URL
const photoLoading = new Set<string>();
const photoKey = (p: Photo) => `${p.id}@${p.version}`;
function photoAttrs(p: Photo | null | undefined, label = "") {
  if (!p) return `class="ph empty"`;
  const url = photoUrls.get(photoKey(p));
  return `class="ph${url ? "" : " loading"}" data-photo="${p.id}" data-v="${esc(p.version)}" data-l="${esc(label)}" style="background-position:${esc(p.focus)};${url ? `background-image:url(${url})` : ""}"`;
}
function hydratePhotos() {
  app.querySelectorAll<HTMLElement>("[data-photo]").forEach((el) => {
    const key = `${el.dataset.photo}@${el.dataset.v}`;
    const ready = photoUrls.get(key);
    if (ready) { el.style.backgroundImage = `url(${ready})`; el.classList.remove("loading"); return; }
    if (photoLoading.has(key)) return;
    photoLoading.add(key);
    fetchPhoto(el.dataset.photo!)
      .then((blob) => {
        photoUrls.set(key, URL.createObjectURL(blob));
        app.querySelectorAll<HTMLElement>(`[data-photo="${el.dataset.photo}"]`).forEach((x) => { x.style.backgroundImage = `url(${photoUrls.get(key)})`; x.classList.remove("loading"); });
      })
      .catch((e) => { if (e instanceof LockedError) { state.locked = true; render(); } })
      .finally(() => photoLoading.delete(key));
  });
}

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

// ---------- derived values ----------
/** The house savings goal: a manual Money & Home goal with a target and a current amount. */
function houseGoal(d: Summary): Goal | null {
  if (!d.goals.ok) return null;
  const all = d.goals.data.filter((g) => g.area === "Money & Home" && g.target && g.current !== null);
  return all.find((g) => /house|casa/i.test(g.name)) ?? all[0] ?? null;
}
function goalsDone(d: Summary) {
  if (!d.goals.ok) return null;
  const gs = d.goals.data;
  return { done: gs.filter((g) => g.status === "Done").length, total: gs.length };
}
function goalDetail(g: Goal): string {
  if (g.status === "Done") return "Done";
  if (g.tracking === "Milestones" && g.children.length) return `${g.children.filter((c) => c.status === "Done").length}/${g.children.length} milestones`;
  if (g.tracking === "Habit" && g.target && g.progress !== null) return `${Math.round(g.progress * g.target)}/${g.target} weeks`;
  if (g.target && g.current !== null) return `${eur(g.current)} / ${eur(g.target)}`;
  return g.status;
}
const goalValue = (g: Goal) => (g.status === "Done" ? 1 : g.progress);

// ---------- views ----------
const card = (cls: string, icon: keyof typeof I | null, title: string, right: string, body: string, id = "") =>
  `<section class="${cls} pad"${id ? ` id="${id}"` : ""}><div class="card-h"><h3>${icon ? svg(I[icon]) : ""}${title}</h3>${right}</div>${body}</section>`;
const errorCard = (title: string, error: string) => card("glass", null, title, "", `<div class="err">${esc(error)}</div>`);

function render() {
  if (state.locked) { app.innerHTML = lockView(); bindLock(); return; }
  const d = state.data;
  const wide = WIDE.matches;
  const date = new Date();
  const head = `<header class="top">
      <div><div class="eyebrow">${date.toLocaleDateString("en-GB", { weekday: "long" })} · ${date.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}</div>
        <h1>${greeting()}, <em>303</em></h1></div>
      <div class="top-r">
        ${state.weather ? `<span class="chip">${WEATHER.city} · ${state.weather.temp}° · ${state.weather.text} · ${state.weather.min}°/${state.weather.max}°</span>` : ""}
        <span class="chip num">${date.getFullYear()} · ${(yearProgress() * 100).toFixed(1)}%</span>
        <button class="icon-btn ${state.loading ? "spin" : ""}" data-act="refresh" aria-label="Refresh">${svg(I.refresh, 1.8)}</button>
      </div>
    </header>`;
  const body = !d
    ? `<section class="glass pad"><div class="empty">${state.loading ? "Loading your day…" : "No data yet. Tap refresh to load it."}</div></section>`
    : wide ? dashboard(d) : view(d);
  app.innerHTML = wide
    ? `<div class="shell">${sidebar(d)}<main class="main">${head}${body}</main></div>`
    : `<div class="phone">${head}${body}</div>
       <nav class="tabs" aria-label="Sections"><div class="in" role="tablist">
         ${TABS.map((t) => `<button role="tab" data-tab="${t}" aria-selected="${state.tab === t}">${svg(I[t === "today" ? "sun" : t === "habits" ? "flame" : "life"])}${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}
       </div></nav>`;
  hydratePhotos();
}

function sidebar(d: Summary | null) {
  const links: [string, keyof typeof I, string][] = [["top", "grid", "Dashboard"], ["vision", "eye", "Vision"], ["areas", "life", "Life areas"], ["habits", "flame", "Habits"], ["learning", "code", "Learning"], ["goals", "target", "Goals"]];
  const h = d ? houseGoal(d) : null;
  return `<aside class="glass side" aria-label="Sections">
    <div class="logo"><span>303</span>Life</div>
    <nav class="nav">${links.map(([id, ic, label], i) => `<a href="#${id}" data-jump="${id}"${i === 0 ? ' aria-current="page"' : ""}>${svg(I[ic])}${label}</a>`).join("")}</nav>
    ${h ? `<div class="side-foot"><b>${esc(h.name)}</b><span class="num">${eur(h.current ?? 0)} saved · ${pct(h.progress ?? 0)}</span><div class="bar"><i style="width:${pct(h.progress ?? 0)}"></i></div></div>` : ""}
  </aside>`;
}

function dashboard(d: Summary) {
  return `${visionSection(d)}
    <div class="row3">${todayCard(d)}${top3Card(d)}${agendaCard(d)}</div>
    ${areasSection(d)}
    <div class="row2">
      ${habitsCard(d)}
      <div class="stack">${learningCard(d)}${goalsCard(d)}</div>
    </div>`;
}

function view(d: Summary) {
  switch (state.tab) {
    case "today": return `<div class="stack">${visionSection(d)}${todayCard(d)}${top3Card(d)}${agendaCard(d)}${habitsToday(d)}</div>`;
    case "habits": return `<div class="stack">${habitsCard(d)}</div>`;
    case "life": return `<div class="stack">${areasSection(d)}${goalsCard(d)}${learningCard(d)}</div>`;
  }
}

function ring(p: number, label: string) {
  return `<div class="ring" style="--p:${Math.round(p * 100)}" data-v="${esc(label)}"></div>`;
}

function visionSection(d: Summary) {
  const v = d.vision;
  if (v && !v.ok) return errorCard("Vision", v.error);
  const photos = v?.ok ? v.data.collage : [];
  const h = houseGoal(d), g = goalsDone(d);
  const stats = `<div class="vision-stats">
      ${h ? `<div class="vstat">${ring(h.progress ?? 0, pct(h.progress ?? 0))}<div><b class="num">${eur(h.current ?? 0)}</b><span>of ${eur(h.target!)} for the house</span></div></div>` : ""}
      ${g && g.total ? `<div class="vstat">${ring(g.done / g.total, `${g.done}/${g.total}`)}<div><b class="num">${g.done} of ${g.total}</b><span>${d.today.slice(0, 4)} goals done</span></div></div>` : ""}
    </div>`;
  if (!photos.length) {
    return `<section class="glass vision empty-vision" id="vision"><div class="vision-empty"><b>Your vision board is empty</b><span>Add photos to the Vision Board in Notion, tick “Active” and “In collage”. A new set shows every day.</span></div>${stats}</section>`;
  }
  const n = photos.length;
  return `<section class="glass vision n${Math.min(n, 8)}" id="vision" aria-label="Vision board">
    ${photos.map((p, i) => `<div ${photoAttrs(p, p.name)} data-i="${i}"></div>`).join("")}
    ${stats}
  </section>`;
}

function todayCard(d: Summary) {
  const hs = d.habits.ok ? d.habits.data.habits : [];
  const best = hs.reduce((m, h) => Math.max(m, h.streak), 0);
  const month = d.habits.ok && d.habits.data.stats ? pct(d.habits.data.stats.monthRate) : "–";
  let exams = 0;
  if (d.agenda.ok) {
    const limit = addDaysISO(d.today, 7);
    exams = d.agenda.data.items.filter((i) => i.kind === "Exam").length + d.agenda.data.upcoming.filter((u) => u.kind === "Exam" && u.date <= limit).length;
  }
  return `<section class="deep pad" id="today">
    <div class="card-h"><h3>${svg(I.clock)}Today</h3>${hs.length ? `<span class="chip num">${hs.filter((h) => h.doneToday).length} of ${hs.length} habits</span>` : ""}</div>
    <div class="clock num" data-clock>${clockNow()}</div>
    <div class="meta">${new Date(d.today + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>
    <div class="mini-stats">
      <div class="mini"><b class="num">${best}</b><span>Best streak now</span></div>
      <div class="mini"><b class="num">${month}</b><span>Habits this month</span></div>
      <div class="mini"><b class="num">${exams}</b><span>${exams === 1 ? "Exam" : "Exams"} in 7 days</span></div>
    </div>
  </section>`;
}

function top3Card(d: Summary) {
  if (!d.top3.ok) return errorCard("Top 3", d.top3.error);
  const list = d.top3.data;
  return card("glass", "star", "Top 3", `<span class="meta num">${list.filter((p) => p.done).length} / ${list.length}</span>`,
    `${list.length ? list.map((p) => `<button type="button" class="prio" data-prio="${p.id}" aria-pressed="${p.done}"><span class="box">${p.done ? svg(I.check, 3) : ""}</span><span>${esc(p.name)}</span></button>`).join("") : `<div class="empty">No priorities for today yet.</div>`}
     ${list.length < 3 ? `<form class="add" data-form="prio"><input id="prio-input" name="name" placeholder="Add a priority" autocomplete="off" maxlength="200" aria-label="New priority"><button class="btn" type="submit">Add</button></form>` : ""}`);
}

function agendaCard(d: Summary) {
  if (!d.agenda.ok) return errorCard("Agenda", d.agenda.error);
  const { items, upcoming, scheduleOk } = d.agenda.data;
  const row = (time: string, title: string, sub: string, kind: string) =>
    `<div class="ev"><time class="num">${time}</time><i class="${kind === "Class" ? "cls" : kind === "Exam" ? "exam" : ""}"></i><div><b>${esc(title)}</b><small>${esc(sub)}</small></div></div>`;
  return card("glass", "cal", "Agenda", `<span class="meta">${items.length ? `${items.length} today` : "Free day"}</span>`,
    `${items.length ? items.map((i) => row(i.start ?? "All day", i.title, `${i.kind}${i.end ? ` · until ${i.end}` : ""}`, i.kind)).join("") : `<div class="empty">Nothing scheduled today.</div>`}
     ${!scheduleOk ? `<div class="err">Couldn't read the class schedule from Notion.</div>` : ""}
     ${upcoming.length ? `<div class="eyebrow sub-h">Coming up</div>${upcoming.map((u) => row(shortDate(u.date).split(" ").slice(1).join(" "), u.title, u.kind, u.kind)).join("")}` : ""}`);
}

function habitsToday(d: Summary) {
  if (!d.habits.ok) return errorCard("Habits today", d.habits.error);
  const hs = d.habits.data.habits, can = d.habits.data.hasTodayRow;
  return card("glass", "flame", "Habits today", `<span class="meta num">${hs.filter((h) => h.doneToday).length} / ${hs.length}</span>`,
    `${can ? "" : `<div class="err">There is no row for today in the Habit Tracker yet.</div>`}
     <div class="habit-grid">${hs.map((h) => `<button type="button" class="hbtn" data-habit="${esc(h.prop)}" aria-pressed="${h.doneToday}" ${can ? "" : "disabled"} style="--c:${look(h).c}"><span class="ico">${svg(I[look(h).i])}</span><span>${esc(h.label)}</span></button>`).join("")}</div>`);
}

function areasSection(d: Summary) {
  const covers = d.vision?.ok ? d.vision.data.covers : {};
  const goals = d.goals.ok ? d.goals.data : [];
  const cards = AREAS.map((a) => {
    const gs = goals.filter((g) => g.area === a);
    const vals = gs.map(goalValue).filter((v): v is number => v !== null);
    const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    const sub = gs.length ? `${esc(gs[0].name)} · ${esc(goalDetail(gs[0]))}${gs.length > 1 ? ` · +${gs.length - 1}` : ""}` : "No goals yet · add one in Notion";
    return `<div class="glass area"><div ${photoAttrs(covers[a])}></div><div class="area-b">
      <div class="area-t"><b>${esc(a)}</b><span class="num">${avg === null ? "–" : pct(avg)}</span></div>
      <div class="bar"><i style="width:${avg === null ? 0 : pct(avg)}"></i></div><small>${sub}</small></div></div>`;
  }).join("");
  return `<section id="areas"><div class="sec-h"><h2>Life areas</h2><span class="meta">Photo from your Vision Board · progress from your goals</span></div>
    ${!d.goals.ok ? `<div class="err">${esc(d.goals.error)}</div>` : ""}
    <div class="areas">${cards}</div></section>`;
}

function habitsCard(d: Summary) {
  if (!d.habits.ok) return errorCard("Habits", d.habits.error);
  const { habits: hs, weekHasRow, stats } = d.habits.data;
  const todayIdx = (new Date(d.today + "T12:00:00").getDay() + 6) % 7;
  const monday = addDaysISO(d.today, -todayIdx);
  const rows = hs.map((h) => {
    const { c, i } = look(h);
    const best = h.streak > 0 && h.streak >= h.best;
    const days = h.week.map((v, k) => {
      if (v === null) return `<span class="day fut" aria-hidden="true"></span>`;
      const can = weekHasRow ? weekHasRow[k] : k === todayIdx;
      return `<button type="button" class="day ${v ? "on" : ""} ${k === todayIdx ? "today" : ""}" data-day="${esc(h.prop)}" data-date="${addDaysISO(monday, k)}" aria-pressed="${v}" aria-label="${esc(`${h.label}, ${WEEKDAYS[k]}`)}" ${can ? "" : "disabled"}>${v ? svg(I.check, 3) : ""}</button>`;
    }).join("");
    return `<div class="hrow" style="--c:${c}">
      <div class="hn"><span class="ico">${svg(I[i])}</span><div><b>${esc(h.label)}</b><small class="${best ? "best" : ""}">${best ? "Your best streak!" : `Best: ${h.best} ${h.best === 1 ? "day" : "days"} · ${h.weekCount}/${h.target} this week`}</small></div></div>
      <div class="days">${days}</div>
      <div class="streak num" title="Current streak">${svg(I.flame, 1.8)}${h.streak}</div>
    </div>`;
  }).join("");
  return card("glass", "flame", "Habits", `<span class="chip num">${hs.filter((h) => h.doneToday).length} of ${hs.length} today</span>`,
    `<div class="hrow head"><span></span><div class="days">${DAYS.map((x, k) => `<span class="${k === todayIdx ? "t" : ""}">${x}</span>`).join("")}</div><span class="meta" style="text-align:right">Streak</span></div>
     ${rows}${stats ? statsBlock(stats, hs.length, d.today) : ""}`, "habits");
}

function statsBlock(s: HabitStats, count: number, today: string) {
  const level = (n: number | null) => (n === null ? -1 : n === 0 ? 0 : n >= count ? 4 : Math.min(3, 1 + Math.floor((n / count) * 3)));
  const cells = s.days.map((x) => {
    const l = level(x.done);
    return `<i class="${x.date === today ? "t" : ""}" style="background:${l < 0 ? "transparent" : HEAT[l]}" title="${x.done === null ? "" : `${x.date}: ${x.done} of ${count}`}"></i>`;
  }).join("");
  return `<div class="lower">
    <div><div class="card-h small"><span class="meta">Last 20 weeks</span><span class="legend">Less ${HEAT.map((c) => `<i style="background:${c}"></i>`).join("")} Perfect</span></div>
      <div class="hm" role="img" aria-label="Habits completed per day over the last 20 weeks">${cells}</div></div>
    <div class="stats">
      <div class="stat"><span>Done this month</span><b class="num">${Math.round(s.monthRate * 100)}%</b></div>
      <div class="stat"><span>Perfect days</span><b class="num">${s.perfectDays}</b></div>
      <div class="stat"><span>Best day</span><b>${s.bestWeekday === null ? "–" : WEEKDAYS[s.bestWeekday]}</b></div>
    </div>
  </div>`;
}

function learningCard(d: Summary) {
  const l = d.learning;
  if (l && !l.ok) return errorCard("Learning roadmap", l.error);
  const items: LearningItem[] = l?.ok ? l.data : [];
  const done = items.filter((x) => x.status === "Done").length;
  const step = (x: LearningItem) => {
    const cls = x.status === "Done" ? "done" : x.status === "Learning" ? "now" : "";
    const when = x.status === "Done" ? (x.target ?? x.start) : x.target;
    const name = x.link ? `<a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.name)}</a>` : esc(x.name);
    return `<div class="step ${cls}"><span class="dot"></span><div><b>${name}</b><small>${esc(x.status)}${when ? ` · ${x.status === "Done" ? "" : "target "}${monthYear(when)}` : ""}</small></div><span class="tag">${x.status === "Learning" ? "Now" : esc(x.type ?? "")}</span></div>`;
  };
  return `<section class="deep pad" id="learning"><div class="card-h"><h3>${svg(I.code)}Learning roadmap</h3>${items.length ? `<span class="chip num">${done} of ${items.length} done</span>` : ""}</div>
    ${items.length ? `<div class="road">${items.map(step).join("")}</div>` : `<div class="meta">Add technologies and courses to the Learning database in Notion.</div>`}</section>`;
}

function goalRow(g: Goal): string {
  const done = g.status === "Done";
  const v = goalValue(g);
  const right = done ? `<span class="pill ok">Done</span>` : `<small class="num">${esc(goalDetail(g))}</small>`;
  const bar = v !== null && !done ? `<div class="bar"><i style="width:${pct(v)}"></i></div>` : "";
  const subs = g.children.filter((c) => c.kind === "Sub-goal");
  const steps = g.children.filter((c) => c.kind !== "Sub-goal");
  const ms = (list: Goal[]) => `<div class="ms">${list.map((m) => `<button type="button" data-goal="${m.id}" aria-pressed="${m.status === "Done"}">${esc(m.name)}</button>`).join("")}</div>`;
  return `<div class="goal">
    <div class="goal-t"><span>${esc(g.name)}</span>${right}</div>${bar}
    ${steps.length ? ms(steps) : ""}
    ${subs.map((s) => `<div class="sub">↳ ${esc(s.name)} ${s.status === "Done" ? "· done" : s.progress !== null ? `· ${pct(s.progress)}` : ""}</div>${s.children.length ? ms(s.children) : ""}`).join("")}
  </div>`;
}

function goalsCard(d: Summary) {
  if (!d.goals.ok) return errorCard("Goals", d.goals.error);
  const gs = d.goals.data;
  return card("glass", "target", `${d.today.slice(0, 4)} goals`, `<span class="meta">${gs.filter((g) => g.status === "Done").length} of ${gs.length} done</span>`,
    `${gs.length ? gs.map(goalRow).join("") : `<div class="empty">No goals for this year in Notion yet.</div>`}<div class="meta hint">Tap a milestone to mark it done.</div>`, "goals");
}

function lockView() {
  return `<div class="lock"><form class="glass pad" data-form="pin">
    <div class="logo"><span>303</span>Life</div>
    <input id="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="current-password" aria-label="PIN" placeholder="PIN" maxlength="12">
    ${state.lockError ? `<div class="err">${esc(state.lockError)}</div>` : ""}
    <button class="btn" type="submit">Unlock</button>
  </form></div>`;
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
  const jump = (e.target as HTMLElement).closest<HTMLElement>("[data-jump]");
  if (jump) {
    e.preventDefault();
    document.getElementById(jump.dataset.jump!)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    app.querySelectorAll("[data-jump]").forEach((a) => a.toggleAttribute("aria-current", a === jump));
    return;
  }
  const el = (e.target as HTMLElement).closest<HTMLElement>("button");
  if (!el) return;
  if (el.dataset.act === "refresh") return refresh(true);
  if (el.dataset.tab) {
    state.tab = el.dataset.tab as Tab;
    store.set(TAB_KEY, state.tab);
    render();
    scrollTo(0, 0);
    return;
  }
  const d = state.data;
  if (!d) return;

  if (el.dataset.habit && d.habits.ok) {
    const h = d.habits.data.habits.find((x) => x.prop === el.dataset.habit)!;
    const done = !h.doneToday;
    const ti = (new Date(d.today + "T12:00:00").getDay() + 6) % 7;
    h.doneToday = done; // optimistic
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
setInterval(() => { const c = app.querySelector("[data-clock]"); if (c) c.textContent = clockNow(); }, 20_000);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js").catch(() => {});
}

WIDE.addEventListener("change", () => render());
render();
loadWeather();
refresh();
