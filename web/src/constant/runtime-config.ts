// Runtime configuration access layer.
// Priority: window.__RUNTIME_CONFIG__ (injected by the container entrypoint) > build-time VITE_ variables > defaults.
// This supports both configuring the same image with docker run -e and injecting values during custom builds.
//
// Each analytics provider has its own variable; configured providers are enabled independently and all are disabled by default.
// SuperToken authorization and media API overrides can also be supplied at container startup without rebuilding the Vite bundle.

export type RuntimeConfig = {
    ANALYTICS_GA4_ID?: string; // GA4 measurement ID (G-XXXX)
    ANALYTICS_BAIDU_ID?: string; // Baidu Analytics site ID
    SUPERTOKEN_BASE_URL?: string; // Optional SuperToken media API override
    SUPERTOKEN_AUTH_BASE_URL?: string; // SuperToken authorization/new-api origin
};

declare global {
    interface Window {
        __RUNTIME_CONFIG__?: RuntimeConfig;
    }
}

const runtime: RuntimeConfig = (typeof window !== "undefined" && window.__RUNTIME_CONFIG__) || {};

export function readRuntimeConfig(key: keyof RuntimeConfig, buildTime: string | undefined, fallback = "", source: RuntimeConfig = runtime): string {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof buildTime === "string" && buildTime.trim()) return buildTime.trim();
    return fallback;
}

export const ANALYTICS_GA4_ID = readRuntimeConfig("ANALYTICS_GA4_ID", import.meta.env.VITE_ANALYTICS_GA4_ID);
export const ANALYTICS_BAIDU_ID = readRuntimeConfig("ANALYTICS_BAIDU_ID", import.meta.env.VITE_ANALYTICS_BAIDU_ID);
export const SUPERTOKEN_BASE_URL = readRuntimeConfig("SUPERTOKEN_BASE_URL", import.meta.env.VITE_SUPERTOKEN_BASE_URL);
export const SUPERTOKEN_AUTH_BASE_URL = readRuntimeConfig("SUPERTOKEN_AUTH_BASE_URL", import.meta.env.VITE_SUPERTOKEN_AUTH_BASE_URL, "https://supertoken.cc");
