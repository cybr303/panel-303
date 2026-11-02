import { API_URL } from "./config";

const TOKEN_KEY = "p303.token";

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(t: string | null) {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {}
}

export class LockedError extends Error {}

async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  if (!API_URL) throw new Error("The server address is not set yet.");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API_URL + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/api/auth") { setToken(null); throw new LockedError("Locked"); }
  if (!res.ok) throw new Error((data as any).error ?? `Error ${res.status}`);
  return data as T;
}

// ----- Types returned by the worker -----
export type Section<T> = { ok: true; data: T } | { ok: false; error: string };
export interface Habit { prop: string; label: string; target: number; doneToday: boolean; streak: number; best: number; weekCount: number; week: (boolean | null)[]; weeksMet: number }
export interface Priority { id: string; name: string; order: number; done: boolean }
export interface AgendaItem { start: string | null; end: string | null; title: string; kind: "Class" | "Event" | "Exam" | "Assignment" }
export interface Upcoming { title: string; date: string; kind: "Exam" | "Assignment" }
export interface Goal { id: string; name: string; kind: string; status: string; tracking: string; habit: string | null; target: number | null; source: string; due: string | null; progress: number | null; children: Goal[] }
export interface DayCount { date: string; done: number | null }
export interface HabitStats { days: DayCount[]; monthRate: number; perfectDays: number; bestWeekday: number | null }
export interface Summary {
  today: string;
  habits: Section<{ habits: Habit[]; hasTodayRow: boolean; weekHasRow?: boolean[]; stats?: HabitStats }>;
  top3: Section<Priority[]>;
  agenda: Section<{ items: AgendaItem[]; upcoming: Upcoming[]; scheduleOk: boolean }>;
  goals: Section<Goal[]>;
  generatedAt: string;
}

export const api = {
  login: (pin: string) => request<{ token: string }>("POST", "/api/auth", { pin }),
  summary: () => request<Summary>("GET", "/api/summary"),
  setHabit: (prop: string, done: boolean, date?: string) => request("POST", "/api/habit", { prop, done, date }),
  setPriority: (id: string, done: boolean) => request("POST", "/api/top3/done", { id, done }),
  addPriority: (name: string) => request("POST", "/api/top3", { name }),
  setGoal: (id: string, status: string) => request("POST", "/api/goal", { id, status }),
};
