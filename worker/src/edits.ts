// Panel edits for the Learning roadmap and the Vision Board. Validates input and returns Notion properties.
import { AREAS } from "./config";

export class InvalidEdit extends Error {}

const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
function oneOf(v: unknown, list: readonly string[], what: string): string | null {
  const s = v ? clean(v, 60) : "";
  if (!s) return null;
  if (!list.includes(s)) throw new InvalidEdit(`Unknown ${what}`);
  return s;
}
function dateOrNull(v: unknown, what: string) {
  const s = v ? clean(v, 10) : "";
  if (s && !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new InvalidEdit(`${what} must be a date`);
  return s ? { start: s } : null;
}

export const LEARNING_STATUS = ["Planned", "Learning", "Done"] as const;
export const LEARNING_TYPES = ["Technology", "Course", "Certification", "Book"] as const;

export function learningProperties(input: Record<string, unknown>, creating: boolean): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (has(input, "name") || creating) {
    const name = clean(input.name, 200);
    if (!name) throw new InvalidEdit("Write a name first");
    p.Name = { title: [{ text: { content: name } }] };
  }
  if (has(input, "status") || creating) p.Status = { select: { name: oneOf(input.status ?? "Planned", LEARNING_STATUS, "status") ?? "Planned" } };
  if (has(input, "type")) { const t = oneOf(input.type, LEARNING_TYPES, "type"); p.Type = { select: t ? { name: t } : null }; }
  if (has(input, "start")) p.Start = { date: dateOrNull(input.start, "Start") };
  if (has(input, "target")) p["Target date"] = { date: dateOrNull(input.target, "Target date") };
  if (has(input, "link")) {
    const link = clean(input.link, 500);
    if (link && !/^https?:\/\/\S+$/i.test(link)) throw new InvalidEdit("The link must start with http:// or https://");
    p.Link = { url: link || null };
  }
  if (has(input, "notes")) p.Notes = { rich_text: input.notes ? [{ text: { content: clean(input.notes, 2000) } }] : [] };
  if (has(input, "order")) {
    const o = input.order === "" || input.order === null ? null : Number(input.order);
    if (o !== null && !Number.isFinite(o)) throw new InvalidEdit("Order must be a number");
    p.Order = { number: o };
  }
  return p;
}

export const FOCUS = ["Center", "Top", "Bottom", "Left", "Right"] as const;
export const PHOTO_AREAS = ["Vision", ...AREAS] as const;

export function photoProperties(input: Record<string, unknown>): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (has(input, "name")) p.Name = { title: [{ text: { content: clean(input.name, 200) || "Photo" } }] };
  if (has(input, "area")) { const a = oneOf(input.area, PHOTO_AREAS, "area"); p.Area = { select: a ? { name: a } : null }; }
  if (has(input, "focus")) p.Focus = { select: { name: oneOf(input.focus, FOCUS, "focus") ?? "Center" } };
  if (has(input, "inCollage")) p["In collage"] = { checkbox: input.inCollage === true };
  if (has(input, "active")) p.Active = { checkbox: input.active === true };
  return p;
}

/** Images the panel may upload, and the largest size accepted (the panel resizes before sending). */
export const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
