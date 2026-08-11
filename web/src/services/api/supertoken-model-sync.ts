import { syncAuthorizedSuperTokenModels, syncedSuperTokenChannel, type SuperTokenModelSyncResult } from "@/services/api/supertoken-authorization";
import { configWithChannels, useConfigStore, type ModelChannel, type SuperTokenChannelConfig } from "@/stores/use-config-store";

export const SUPERTOKEN_MODEL_SYNC_INTERVAL_MS = 5 * 60_000;
const LAST_ATTEMPT_KEY = "infinite-canvas:supertoken-model-sync-attempt";
let activeSync: Promise<boolean> | null = null;

export function isAuthorizedSuperTokenChannel(channel: ModelChannel) {
    const settings = channel.provider === "supertoken" ? channel.supertoken : undefined;
    return Boolean(settings?.authorizedAt && settings.imageApiKey.trim() && settings.videoApiKey.trim() && settings.resourceApiKey.trim());
}

export function isSuperTokenModelSyncDue(channel: ModelChannel, now = Date.now(), lastAttemptAt = readLastAttemptAt()) {
    if (!isAuthorizedSuperTokenChannel(channel)) return false;
    const lastSyncAt = channel.supertoken?.syncedAt || 0;
    return now - Math.max(lastSyncAt, lastAttemptAt) >= SUPERTOKEN_MODEL_SYNC_INTERVAL_MS;
}

export function nextSuperTokenModelSyncDelay(channels: ModelChannel[], now = Date.now(), lastAttemptAt = readLastAttemptAt()) {
    const authorized = channels.filter(isAuthorizedSuperTokenChannel);
    if (!authorized.length) return SUPERTOKEN_MODEL_SYNC_INTERVAL_MS;
    return Math.max(0, Math.min(...authorized.map((channel) => Math.max(channel.supertoken?.syncedAt || 0, lastAttemptAt) + SUPERTOKEN_MODEL_SYNC_INTERVAL_MS - now)));
}

export function syncDueSuperTokenModels(now = Date.now()) {
    if (activeSync) return activeSync;
    activeSync = runDueSync(now).finally(() => {
        activeSync = null;
    });
    return activeSync;
}

async function runDueSync(now: number) {
    const snapshot = useConfigStore.getState().config;
    const due = snapshot.channels.filter((channel) => isSuperTokenModelSyncDue(channel, now));
    if (!due.length) return false;
    writeLastAttemptAt(now);

    const synced = await Promise.all(
        due.map(async (channel) => {
            try {
                const result = await syncAuthorizedSuperTokenModels(channel.supertoken!);
                return { channel, result };
            } catch {
                return null;
            }
        }),
    );
    const completed = synced.filter((item): item is { channel: ModelChannel; result: SuperTokenModelSyncResult } => Boolean(item));
    if (!completed.length) return false;

    const current = useConfigStore.getState().config;
    let changed = false;
    const channels = current.channels.map((channel) => {
        const match = completed.find((item) => item.channel.id === channel.id);
        if (!match || !sameSuperTokenCredentials(channel.supertoken, match.channel.supertoken)) return channel;
        changed = true;
        return syncedSuperTokenChannel(channel, match.result, Date.now());
    });
    if (!changed) return false;
    useConfigStore.getState().updateConfigPatch(configWithChannels(current, channels));
    return true;
}

function sameSuperTokenCredentials(current?: SuperTokenChannelConfig, expected?: SuperTokenChannelConfig) {
    return Boolean(current && expected && current.authorizedAt === expected.authorizedAt && current.imageApiKey === expected.imageApiKey && current.videoApiKey === expected.videoApiKey && current.resourceApiKey === expected.resourceApiKey);
}

function readLastAttemptAt() {
    try {
        return Number(localStorage.getItem(LAST_ATTEMPT_KEY)) || 0;
    } catch {
        return 0;
    }
}

function writeLastAttemptAt(value: number) {
    try {
        localStorage.setItem(LAST_ATTEMPT_KEY, String(value));
    } catch {
        // A failed local cache write may cause another tab to repeat the request, but must not block model sync.
    }
}
