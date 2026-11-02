import { checkPin, issueState, issueToken, pinLocked, verifyState, verifyToken } from "./auth";
import { todayIn } from "./dates";
import { addTop3, BadRequest, getAgenda, getGoals, getHabits, getTop3, setGoalStatus, setHabit, setTop3Done } from "./data";
import { getMoney } from "./money";
import { authorizeUrl, finishConnect, msConfigured, MsError } from "./ms";
import { Notion, NotionError } from "./notion";

export interface Env {
  NOTION_TOKEN: string;
  PIN: string;
  SESSION_SECRET: string;
  ALLOWED_ORIGINS: string;
  TIMEZONE: string;
  MS_CLIENT_ID?: string;
  MS_CLIENT_SECRET?: string;
  MS_STORE: KVNamespace;
}

const APP_URL = "https://cybr303.github.io/panel-303/";

const page = (title: string, text: string, status = 200) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
      `<body style="background:#000814;color:#eef5ff;font:16px Inter,system-ui,sans-serif;padding:32px 20px;max-width:480px;margin:auto">` +
      `<h1 style="font-weight:500;font-size:22px">${title}</h1><p style="color:#a3adbf">${text}</p>` +
      `<p><a style="color:#5b9dff" href="${APP_URL}">Back to 303</a></p></body>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

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

      // Microsoft sends the owner back here after sign-in. Only accepted with a fresh state signed by this server.
      if (path === "/api/ms/callback" && req.method === "GET") {
        if (!msConfigured(env)) return page("OneDrive not set up", "The Microsoft app secrets are missing.", 500);
        if (!(await verifyState(env.SESSION_SECRET, url.searchParams.get("state"))))
          return page("Link expired", "Start again from the Money tab.", 400);
        const err = url.searchParams.get("error_description") ?? url.searchParams.get("error");
        if (err) return page("Not connected", escapeHtml(err), 400);
        try {
          await finishConnect(env, url.searchParams.get("code") ?? "", `${url.origin}/api/ms/callback`);
        } catch (e) {
          return page("Not connected", escapeHtml(e instanceof Error ? e.message : String(e)), 502);
        }
        return page("OneDrive connected", "The panel can now read your finance workbook.");
      }

      const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? null;
      if (!(await verifyToken(env.SESSION_SECRET, token))) return json({ error: "Locked" }, 401, h);

      const n = new Notion(env.NOTION_TOKEN);
      const today = todayIn(env.TIMEZONE);

      if (path === "/api/summary" && req.method === "GET") {
        const [habits, top3, agenda] = await Promise.all([
          section(() => getHabits(n, today)),
          section(() => getTop3(n, today)),
          section(() => getAgenda(n, today, env.TIMEZONE)),
        ]);
        const money = await section(() => getMoney(env));
        const goals = await section(() => getGoals(n, today.slice(0, 4), habits.ok ? habits.data.habits : []));
        return json(
          {
            today,
            habits: habits.ok ? { ok: true, data: { habits: habits.data.habits, hasTodayRow: !!habits.data.todayRowId } } : habits,
            top3,
            agenda,
            goals,
            money,
            generatedAt: new Date().toISOString(),
          },
          200,
          h,
        );
      }

      if (req.method === "POST") {
        const body = (await req.json().catch(() => ({}))) as Record<string, any>;
        if (path === "/api/ms/connect") {
          if (!msConfigured(env)) throw new BadRequest("The Microsoft app is not set up yet (MS_CLIENT_ID, MS_CLIENT_SECRET)");
          const state = await issueState(env.SESSION_SECRET);
          return json({ url: authorizeUrl(env, `${url.origin}/api/ms/callback`, state) }, 200, h);
        }
        if (path === "/api/habit") {
          await setHabit(n, today, String(body.prop), !!body.done);
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
      if (e instanceof MsError) return json({ error: `OneDrive: ${e.message}` }, 502, h);
      if (e instanceof NotionError) return json({ error: `Notion: ${e.message}` }, 502, h);
      return json({ error: "Server error" }, 500, h);
    }
  },
};
