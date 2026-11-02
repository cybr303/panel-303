// Address of the Cloudflare Worker. Public on purpose: without the PIN it returns nothing.
// Can be overridden with VITE_API_URL at build time.
const DEFAULT_API_URL = "https://panel-303.panel-303-worker.workers.dev";
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) || DEFAULT_API_URL;

/** Madrid, for the weather chip. */
export const WEATHER = { lat: 40.4168, lon: -3.7038, city: "Madrid" };
