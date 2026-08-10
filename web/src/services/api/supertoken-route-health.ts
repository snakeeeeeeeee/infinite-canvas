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

type SuperTokenRouteHealthMonitor = {
    resourceApiKey: string;
    subscribers: number;
    active: boolean;
    runId: number;
    timer?: number;
};

const CACHE_TTL_MS = 2 * 60 * 1000;
const SLOW_RESPONSE_MS = 2000;
const REQUEST_TIMEOUT_MS = 5000;
const ROUTES: SuperTokenRegion[] = ["cn", "global"];
const healthByRegion = new Map<SuperTokenRegion, SuperTokenRouteHealth>();
const inFlight = new Map<string, Promise<SuperTokenRouteHealth>>();
const listeners = new Set<() => void>();
const monitors = new Map<string, SuperTokenRouteHealthMonitor>();

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

export function checkSuperTokenRoutesHealth(resourceApiKey: string, force = false) {
    return Promise.all(ROUTES.map((region) => checkSuperTokenRouteHealth(region, resourceApiKey, force)));
}

export function monitorSuperTokenRouteHealth(resourceApiKey: string) {
    const key = resourceApiKey.trim();
    const existing = monitors.get(key);
    if (existing) existing.subscribers += 1;
    else {
        const monitor: SuperTokenRouteHealthMonitor = { resourceApiKey: key, subscribers: 1, active: true, runId: 0 };
        monitors.set(key, monitor);
        if (monitors.size === 1) document.addEventListener("visibilitychange", refreshVisibleMonitors);
        void refreshMonitor(monitor);
    }
    return () => {
        const monitor = monitors.get(key);
        if (!monitor || --monitor.subscribers > 0) return;
        monitor.active = false;
        if (monitor.timer) window.clearTimeout(monitor.timer);
        monitors.delete(key);
        if (!monitors.size) document.removeEventListener("visibilitychange", refreshVisibleMonitors);
    };
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

async function refreshMonitor(monitor: SuperTokenRouteHealthMonitor) {
    const runId = ++monitor.runId;
    if (monitor.timer) window.clearTimeout(monitor.timer);
    monitor.timer = undefined;
    if (document.visibilityState !== "visible") return;
    await checkSuperTokenRoutesHealth(monitor.resourceApiKey);
    if (monitor.active && monitor.runId === runId) scheduleMonitor(monitor);
}

function scheduleMonitor(monitor: SuperTokenRouteHealthMonitor) {
    if (document.visibilityState !== "visible") return;
    const tag = credentialTag(monitor.resourceApiKey);
    const checkedAt = ROUTES.map((region) => healthByRegion.get(region)).filter((health) => health?.credentialTag === tag && health.checkedAt).map((health) => health!.checkedAt!);
    const delay = checkedAt.length === ROUTES.length ? Math.max(1000, CACHE_TTL_MS - (Date.now() - Math.max(...checkedAt)) + 50) : CACHE_TTL_MS;
    monitor.timer = window.setTimeout(() => void refreshMonitor(monitor), delay);
}

function refreshVisibleMonitors() {
    if (document.visibilityState !== "visible") return;
    monitors.forEach((monitor) => void refreshMonitor(monitor));
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
