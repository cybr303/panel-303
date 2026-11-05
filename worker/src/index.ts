import { checkPin, issueToken, pinLocked, verifyToken } from "./auth";
import { todayIn } from "./dates";
import { addTop3, BadRequest, getAgenda, getGoals, getHabits, getLearning, getPhotoFile, getTop3, getVision, setGoalStatus, setHabit, setTop3Done } from "./data";
import { Notion, NotionError } from "./notion";

export interface Env {
  NOTION_TOKEN: string;
  PIN: string;
  SESSION_SECRET: string;
  ALLOWED_ORIGINS: string;
  TIMEZONE: string;
}

function cors(env: Env, req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
  return allowed.includes(origin)
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
      }
    : { Vary: "Origin" };
}

const json = (data: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "no-store" } });

/** Runs a section and turns a failure into an error message, so one broken source never hides the rest. */
async function section<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const h = cors(env, req);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "");

    try {
      if (!env.NOTION_TOKEN || !env.PIN || !env.SESSION_SECRET) {
        return json({ error: "The server is missing its secrets (NOTION_TOKEN, PIN, SESSION_SECRET)." }, 500, h);
      }

      if (path === "/api/auth" && req.method === "POST") {
        const ip = req.headers.get("CF-Connecting-IP") ?? "?";
        if (pinLocked(ip)) return json({ error: "Too many attempts. Try again in 10 minutes." }, 429, h);
        const { pin } = (await req.json().catch(() => ({}))) as { pin?: string };
        if (!checkPin(env.PIN, String(pin ?? ""), ip)) return json({ error: "Wrong PIN" }, 401, h);
        return json({ token: await issueToken(env.SESSION_SECRET) }, 200, h);
      }

      const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? null;
      if (!(await verifyToken(env.SESSION_SECRET, token))) return json({ error: "Locked" }, 401, h);

      const n = new Notion(env.NOTION_TOKEN);
      const today = todayIn(env.TIMEZONE);

      if (path === "/api/summary" && req.method === "GET") {
        const [habits, top3, agenda, vision, learning] = await Promise.all([
          section(() => getHabits(n, today)),
          section(() => getTop3(n, today)),
          section(() => getAgenda(n, today, env.TIMEZONE)),
          section(() => getVision(n, today)),
          section(() => getLearning(n)),
        ]);
        const goals = await section(() => getGoals(n, today.slice(0, 4), habits.ok ? habits.data.habits : []));
        return json(
          {
            today,
            habits: habits.ok
              ? { ok: true, data: { habits: habits.data.habits, hasTodayRow: !!habits.data.todayRowId, weekHasRow: habits.data.weekHasRow, stats: habits.data.stats } }
              : habits,
            top3,
            agenda,
            goals,
            vision,
            learning,
            generatedAt: new Date().toISOString(),
          },
          200,
          h,
        );
      }

      // Vision Board photo, streamed through the Worker so it is only visible after the PIN.
      if (path === "/api/photo" && req.method === "GET") {
        const id = url.searchParams.get("id") ?? "";
        const { url: src, version } = await getPhotoFile(n, id);
        const cacheKey = new Request(`https://photo-cache.panel-303/${id}?v=${encodeURIComponent(version)}`);
        const cache = (caches as unknown as { default: Cache }).default;
        let img = await cache.match(cacheKey);
        if (!img) {
          const r = await fetch(src);
          if (!r.ok) throw new BadRequest("The photo could not be downloaded from Notion");
          img = new Response(r.body, { headers: { "Content-Type": r.headers.get("Content-Type") ?? "image/jpeg", "Cache-Control": "max-age=604800" } });
          await cache.put(cacheKey, img.clone());
        }
        return new Response(img.body, { headers: { ...h, "Content-Type": img.headers.get("Content-Type") ?? "image/jpeg", "Cache-Control": "private, max-age=86400" } });
      }

      if (req.method === "POST") {
        const body = (await req.json().catch(() => ({}))) as Record<string, any>;
        if (path === "/api/habit") {
          await setHabit(n, today, String(body.prop), !!body.done, body.date ? String(body.date) : today);
          return json({ ok: true }, 200, h);
        }
        if (path === "/api/top3/done") {
          await setTop3Done(n, String(body.id), !!body.done);
          return json({ ok: true }, 200, h);
        }
        if (path === "/api/top3") {
          const name = String(body.name ?? "").trim();
          if (!name) throw new BadRequest("Write a priority first");
          await addTop3(n, today, name);
          return json({ ok: true }, 200, h);
        }
        if (path === "/api/goal") {
          await setGoalStatus(n, String(body.id), String(body.status));
          return json({ ok: true }, 200, h);
        }
      }

      return json({ error: "Not found" }, 404, h);
    } catch (e) {
      if (e instanceof BadRequest) return json({ error: e.message }, 400, h);
      if (e instanceof NotionError) return json({ error: `Notion: ${e.message}` }, 502, h);
      return json({ error: "Server error" }, 500, h);
    }
  },
};
