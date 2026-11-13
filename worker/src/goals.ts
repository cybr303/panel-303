// Editing goals and milestones from the panel. Notion stays the store; this turns panel input into Notion properties.
import { AREAS, HABITS } from "./config";

export const STATUSES = ["Not started", "In progress", "Done", "Archived"] as const;
export const TRACKINGS = ["Habit", "Milestones", "Manual"] as const;

export class InvalidGoal extends Error {}

export interface GoalInput {
  name?: unknown; area?: unknown; tracking?: unknown; habit?: unknown;
  target?: unknown; current?: unknown; due?: unknown; status?: unknown; notes?: unknown;
}

const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
function numberOrNull(v: unknown, field: string): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 1e9) throw new InvalidGoal(`${field} must be a positive number`);
  return n;
}

/**
 * Validates panel input and returns the Notion properties to write.
 * Only fields present in the input are written, so a partial update leaves the rest alone.
 * `creating` requires a name and fills sensible defaults.
 */
export function goalProperties(input: GoalInput, creating: boolean): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  const has = (k: keyof GoalInput) => Object.prototype.hasOwnProperty.call(input, k);

  if (has("name") || creating) {
    const name = clean(input.name, 200);
    if (!name) throw new InvalidGoal("Write a name first");
    props.Name = { title: [{ text: { content: name } }] };
  }
  if (has("area")) {
    const area = input.area ? clean(input.area, 50) : null;
    if (area && !(AREAS as readonly string[]).includes(area)) throw new InvalidGoal("Unknown area");
    props.Area = { select: area ? { name: area } : null };
  }
  if (has("tracking") || creating) {
    const tracking = clean(input.tracking ?? "Manual", 20);
    if (!(TRACKINGS as readonly string[]).includes(tracking)) throw new InvalidGoal("Unknown way of tracking");
    props.Tracking = { select: { name: tracking } };
  }
  if (has("habit")) {
    const habit = input.habit ? clean(input.habit, 60) : null;
    if (habit && !HABITS.some((h) => h.prop === habit)) throw new InvalidGoal("Unknown habit");
    props.Habit = { select: habit ? { name: habit } : null };
  }
  if (has("target")) props.Target = { number: numberOrNull(input.target, "Target") };
  if (has("current")) props.Current = { number: numberOrNull(input.current, "Current") };
  if (has("due")) {
    const due = input.due ? clean(input.due, 10) : null;
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new InvalidGoal("Due must be a date");
    props.Due = { date: due ? { start: due } : null };
  }
  if (has("status") || creating) {
    const status = clean(input.status ?? "Not started", 20);
    if (!(STATUSES as readonly string[]).includes(status)) throw new InvalidGoal("Unknown status");
    props.Status = { status: { name: status } };
  }
  if (has("notes")) props.Notes = { rich_text: input.notes ? [{ text: { content: clean(input.notes, 2000) } }] : [] };
  return props;
}
