// Minimal Notion REST client (API version with data sources).

const API = "https://api.notion.com/v1";
const VERSION = "2025-09-03";

export class NotionError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export class Notion {
  constructor(private token: string) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(API + path, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Notion-Version": VERSION,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      let msg = res.statusText;
      try {
        msg = ((await res.json()) as { message?: string }).message ?? msg;
      } catch {}
      throw new NotionError(res.status, msg);
    }
    return (await res.json()) as T;
  }

  /** Queries every page of a data source (follows pagination). */
  async query(dataSourceId: string, body: Record<string, unknown> = {}): Promise<Page[]> {
    const out: Page[] = [];
    let cursor: string | undefined;
    do {
      const r = await this.call<{ results: Page[]; has_more: boolean; next_cursor: string | null }>(
        "POST",
        `/data_sources/${dataSourceId}/query`,
        { ...body, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) },
      );
      out.push(...r.results);
      cursor = r.has_more ? r.next_cursor ?? undefined : undefined;
    } while (cursor);
    return out;
  }

  getPage(pageId: string) {
    return this.call<Page & { parent: { type: string; data_source_id?: string }; last_edited_time: string }>("GET", `/pages/${pageId}`);
  }

  updatePage(pageId: string, properties: Record<string, unknown>) {
    return this.call<Page>("PATCH", `/pages/${pageId}`, { properties });
  }

  createPage(dataSourceId: string, properties: Record<string, unknown>) {
    return this.call<Page>("POST", `/pages`, { parent: { type: "data_source_id", data_source_id: dataSourceId }, properties });
  }

  async children(blockId: string): Promise<Block[]> {
    const out: Block[] = [];
    let cursor: string | undefined;
    do {
      const r = await this.call<{ results: Block[]; has_more: boolean; next_cursor: string | null }>(
        "GET",
        `/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`,
      );
      out.push(...r.results);
      cursor = r.has_more ? r.next_cursor ?? undefined : undefined;
    } while (cursor);
    return out;
  }
}

// ---- Loose shapes of what we read ----
export interface Page {
  id: string;
  url: string;
  last_edited_time?: string;
  properties: Record<string, Prop>;
}
export type Prop = { type: string; [k: string]: any };
export interface Block {
  id: string;
  type: string;
  has_children: boolean;
  [k: string]: any;
}

// ---- Property readers ----
export const text = (p?: Prop): string => {
  if (!p) return "";
  const arr = p.type === "title" ? p.title : p.type === "rich_text" ? p.rich_text : null;
  return Array.isArray(arr) ? arr.map((t: any) => t.plain_text).join("") : "";
};
export const checkbox = (p?: Prop): boolean => !!(p && p.type === "checkbox" && p.checkbox);
export const dateStart = (p?: Prop): string | null => (p && p.type === "date" && p.date ? p.date.start : null);
export const dateEnd = (p?: Prop): string | null => (p && p.type === "date" && p.date ? p.date.end : null);
export const select = (p?: Prop): string | null =>
  p?.type === "select" ? p.select?.name ?? null : p?.type === "status" ? p.status?.name ?? null : null;
export const num = (p?: Prop): number | null => (p && p.type === "number" ? p.number : null);
export const relationIds = (p?: Prop): string[] => (p && p.type === "relation" ? p.relation.map((r: any) => r.id) : []);
export const richTextPlain = (rt: any[] | undefined): string => (rt ?? []).map((t) => t.plain_text).join("").trim();

/** First file of a "files" property: its download URL (Notion-hosted files expire after about an hour). */
export const fileUrl = (p?: Prop): string | null => {
  const f = p && p.type === "files" ? p.files?.[0] : null;
  return f ? (f.type === "file" ? f.file?.url : f.external?.url) ?? null : null;
};
