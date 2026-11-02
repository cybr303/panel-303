// Address of the Cloudflare Worker. Public on purpose: without the PIN it returns nothing.
// Filled in after the first deploy; can be overridden with VITE_API_URL at build time.
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

/** Madrid, for the weather chip. */
export const WEATHER = { lat: 40.4168, lon: -3.7038, city: "Madrid" };
