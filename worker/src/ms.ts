// Microsoft Graph access to the finance workbook in the owner's personal OneDrive.
// The owner grants access once (OAuth, personal accounts). The refresh token rotates, so it lives in KV.

const AUTH = "https://login.microsoftonline.com/consumers/oauth2/v2.0";
const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPES = "offline_access Files.ReadWrite User.Read";
export const WORKBOOK_NAME = "Finanzas_2026.xlsx";

export interface MsEnv {
  MS_CLIENT_ID?: string;
  MS_CLIENT_SECRET?: string;
  MS_STORE: KVNamespace;
}

export class MsError extends Error {}

const K = { refresh: "ms:refresh", item: "ms:item" } as const;

export function msConfigured(env: MsEnv): boolean {
  return !!env.MS_CLIENT_ID && !!env.MS_CLIENT_SECRET;
}

export function authorizeUrl(env: MsEnv, redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: env.MS_CLIENT_ID!,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: SCOPES,
    state,
    prompt: "select_account",
  });
  return `${AUTH}/authorize?${q}`;
}

async function tokenRequest(env: MsEnv, params: Record<string, string>): Promise<{ access_token: string; refresh_token?: string }> {
  const res = await fetch(`${AUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.MS_CLIENT_ID!, client_secret: env.MS_CLIENT_SECRET!, scope: SCOPES, ...params }),
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || !data.access_token) throw new MsError(data.error_description?.split("\r\n")[0] ?? `Microsoft sign-in failed (${res.status})`);
  return data;
}

/** Called once after the owner signs in: stores the refresh token and finds the workbook. */
export async function finishConnect(env: MsEnv, code: string, redirectUri: string): Promise<string> {
  const t = await tokenRequest(env, { grant_type: "authorization_code", code, redirect_uri: redirectUri });
  if (!t.refresh_token) throw new MsError("Microsoft did not return a refresh token");
  await env.MS_STORE.put(K.refresh, t.refresh_token);
  const found = (await graphWith(t.access_token, `/me/drive/root/search(q='${encodeURIComponent(WORKBOOK_NAME)}')?$select=id,name,parentReference`)) as any;
  const item = (found.value ?? []).find((f: any) => f.name === WORKBOOK_NAME);
  if (!item) throw new MsError(`Connected, but ${WORKBOOK_NAME} was not found in OneDrive`);
  await env.MS_STORE.put(K.item, item.id);
  return item.id;
}

let cached: { token: string; exp: number } | null = null;

async function accessToken(env: MsEnv): Promise<string> {
  if (cached && cached.exp > Date.now()) return cached.token;
  const refresh = await env.MS_STORE.get(K.refresh);
  if (!refresh) throw new MsError("OneDrive is not connected yet");
  const t = await tokenRequest(env, { grant_type: "refresh_token", refresh_token: refresh });
  if (t.refresh_token && t.refresh_token !== refresh) await env.MS_STORE.put(K.refresh, t.refresh_token);
  cached = { token: t.access_token, exp: Date.now() + 45 * 60_000 };
  return t.access_token;
}

async function graphWith(token: string, path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(GRAPH + path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new MsError(data.error?.message ?? `Microsoft Graph error ${res.status}`);
  return data;
}

/** Workbook client: every call goes to /me/drive/items/{id}/workbook. */
export class Workbook {
  constructor(private env: MsEnv) {}

  private async base(): Promise<string> {
    const id = await this.env.MS_STORE.get(K.item);
    if (!id) throw new MsError("OneDrive is not connected yet");
    return `/me/drive/items/${id}/workbook`;
  }

  async call(path: string, init: RequestInit = {}): Promise<any> {
    return graphWith(await accessToken(this.env), (await this.base()) + path, init);
  }

  async sheetNames(): Promise<string[]> {
    const r = await this.call("/worksheets?$select=name");
    return (r.value ?? []).map((w: any) => w.name);
  }

  /** Values of the used range of a sheet (already calculated by Excel), as text as shown in Excel. */
  async usedRange(sheet: string): Promise<{ address: string; values: unknown[][]; text: string[][] }> {
    return this.call(`/worksheets('${encodeURIComponent(sheet)}')/usedRange(valuesOnly=true)?$select=address,values,text`);
  }

  async setRange(sheet: string, address: string, values: unknown[][]): Promise<void> {
    await this.call(`/worksheets('${encodeURIComponent(sheet)}')/range(address='${address}')`, {
      method: "PATCH",
      body: JSON.stringify({ values }),
    });
  }
}

export async function msStatus(env: MsEnv): Promise<"not-configured" | "not-connected" | "connected"> {
  if (!msConfigured(env)) return "not-configured";
  return (await env.MS_STORE.get(K.item)) ? "connected" : "not-connected";
}
