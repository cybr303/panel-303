// Money tab. Step 1: connection status and the workbook's sheets.
// The readers for each sheet (Panel, Presupuesto, Saldos, Metas, Patrimonio, Config, Suscripciones)
// are added once the exact cell layout of the workbook is known.

import { msStatus, Workbook, type MsEnv } from "./ms";

export interface Money {
  status: "not-configured" | "not-connected" | "connected";
  sheets?: string[];
  hasSubscriptions?: boolean;
}

export async function getMoney(env: MsEnv): Promise<Money> {
  const status = await msStatus(env);
  if (status !== "connected") return { status };
  const sheets = await new Workbook(env).sheetNames();
  return { status, sheets, hasSubscriptions: sheets.includes("Suscripciones") };
}
