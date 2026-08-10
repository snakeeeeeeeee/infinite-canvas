import { superTokenBaseUrl, type SuperTokenRegion } from "@/lib/supertoken-capabilities";

export type SuperTokenRouteHealth = {
    region: SuperTokenRegion;
    baseUrl: string;
    status: "checking" | "healthy" | "slow" | "unavailable";
    latencyMs?: number;
    checkedAt?: number;
    reason?: "timeout" | "unauthorized" | "http" | "network" | "request";
    credentialTag: string;
};

const CACHE_TTL_MS = 2 * 60 * 1000;
const SLOW_RESPONSE_MS = 2000;
const REQUEST_TIMEOUT_MS = 5000;
const healthByRegion = new Map<SuperTokenRegion, SuperTokenRouteHealth>();
const inFlight = new Map<string, Promise<SuperTokenRouteHealth>>();
const listeners = new Set<() => void>();

export function subscribeSuperTokenRouteHealth(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getSuperTokenRouteHealth(region: SuperTokenRegion, resourceApiKey: string) {
    const health = healthByRegion.get(region);
    return health?.credentialTag === credentialTag(resourceApiKey) ? health : undefined;
}

export function checkSuperTokenRouteHealth(region: SuperTokenRegion, resourceApiKey: string, force = false) {
    const tag = credentialTag(resourceApiKey);
    const cached = healthByRegion.get(region);
    if (!force && cached?.credentialTag === tag && cached.status !== "checking" && cached.reason !== "request" && cached.checkedAt && Date.now() - cached.checkedAt < CACHE_TTL_MS) return Promise.resolve(cached);

    const requestKey = `${region}:${tag}`;
    const pending = inFlight.get(requestKey);
    if (pending) return pending;

    const baseUrl = superTokenBaseUrl(region);
    setHealth({ region, baseUrl, status: "checking", credentialTag: tag });
    const request = probeRoute(region, baseUrl, resourceApiKey, tag).finally(() => inFlight.delete(requestKey));
    inFlight.set(requestKey, request);
    return request;
}

export function markSuperTokenRouteUnavailable(baseUrl: string, resourceApiKey = "") {
    const normalized = normalizeBaseUrl(baseUrl);
    const tag = credentialTag(resourceApiKey);
    let changed = false;
    (["cn", "global"] as SuperTokenRegion[]).forEach((region) => {
        const routeBaseUrl = superTokenBaseUrl(region);
        if (normalizeBaseUrl(routeBaseUrl) !== normalized) return;
        const health = healthByRegion.get(region);
        if (!tag && !health) return;
        healthByRegion.set(region, { region, baseUrl: routeBaseUrl, status: "unavailable", reason: "request", checkedAt: Date.now(), credentialTag: tag || health!.credentialTag });
        changed = true;
    });
    if (changed) emitChange();
}

async function probeRoute(region: SuperTokenRegion, baseUrl: string, resourceApiKey: string, tag: string) {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, REQUEST_TIMEOUT_MS);
    const startedAt = performance.now();
    try {
        const response = await fetch(`${normalizeBaseUrl(baseUrl)}/v1/image/tasks?limit=1`, {
            headers: { Accept: "application/json", Authorization: `Bearer ${resourceApiKey}` },
            cache: "no-store",
            credentials: "omit",
            signal: controller.signal,
        });
        const latencyMs = Math.max(1, Math.round(performance.now() - startedAt));
        await response.body?.cancel();
        if (!response.ok) {
            return setHealth({ region, baseUrl, status: "unavailable", checkedAt: Date.now(), reason: response.status === 401 || response.status === 403 ? "unauthorized" : "http", credentialTag: tag });
        }
        return setHealth({ region, baseUrl, status: latencyMs >= SLOW_RESPONSE_MS ? "slow" : "healthy", latencyMs, checkedAt: Date.now(), credentialTag: tag });
    } catch {
        return setHealth({ region, baseUrl, status: "unavailable", checkedAt: Date.now(), reason: timedOut ? "timeout" : "network", credentialTag: tag });
    } finally {
        window.clearTimeout(timeout);
    }
}

function setHealth(health: SuperTokenRouteHealth) {
    healthByRegion.set(health.region, health);
    emitChange();
    return health;
}

function emitChange() {
    listeners.forEach((listener) => listener());
}

function credentialTag(key: string) {
    return key.trim().slice(-12);
}

function normalizeBaseUrl(baseUrl: string) {
    return baseUrl.trim().replace(/\/+$/, "").toLowerCase();
}
