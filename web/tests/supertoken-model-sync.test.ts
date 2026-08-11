import { beforeAll, describe, expect, test } from "bun:test";

class MemoryStorage implements Storage {
    private values = new Map<string, string>();
    get length() {
        return this.values.size;
    }
    clear() {
        this.values.clear();
    }
    getItem(key: string) {
        return this.values.get(key) ?? null;
    }
    key(index: number) {
        return Array.from(this.values.keys())[index] ?? null;
    }
    removeItem(key: string) {
        this.values.delete(key);
    }
    setItem(key: string, value: string) {
        this.values.set(key, value);
    }
}

beforeAll(() => {
    if (!("localStorage" in globalThis)) Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage() });
});

describe("SuperToken model sync scheduling", () => {
    test("runs authorized channels at most once every five minutes", async () => {
        const [{ SUPERTOKEN_MODEL_SYNC_INTERVAL_MS, isSuperTokenModelSyncDue, nextSuperTokenModelSyncDelay }, { createSuperTokenChannel }] = await Promise.all([import("@/services/api/supertoken-model-sync"), import("@/stores/use-config-store")]);
        const now = 2_000_000;
        const channel = createSuperTokenChannel({
            supertoken: {
                region: "cn",
                imageApiKey: "image-key",
                videoApiKey: "video-key",
                resourceApiKey: "resource-key",
                imageModels: ["gpt-image-2"],
                videoModels: ["leonardo-minimax-h3-1440p"],
                authorizedAt: 1,
                syncedAt: now - SUPERTOKEN_MODEL_SYNC_INTERVAL_MS,
            },
        });
        expect(isSuperTokenModelSyncDue(channel, now, 0)).toBe(true);
        expect(isSuperTokenModelSyncDue(channel, now, now - 1_000)).toBe(false);
        expect(nextSuperTokenModelSyncDelay([channel], now, 0)).toBe(0);
        expect(nextSuperTokenModelSyncDelay([channel], now, now - 1_000)).toBe(SUPERTOKEN_MODEL_SYNC_INTERVAL_MS - 1_000);
    });

    test("does not silently take over manually configured credentials", async () => {
        const [{ isAuthorizedSuperTokenChannel }, { createSuperTokenChannel }] = await Promise.all([import("@/services/api/supertoken-model-sync"), import("@/stores/use-config-store")]);
        const manual = createSuperTokenChannel({ supertoken: { region: "cn", imageApiKey: "image", videoApiKey: "video", resourceApiKey: "resource", imageModels: [], videoModels: [] } });
        expect(isAuthorizedSuperTokenChannel(manual)).toBe(false);
        expect(isAuthorizedSuperTokenChannel({ ...manual, supertoken: { ...manual.supertoken!, authorizedAt: 1 } })).toBe(true);
    });
});

describe("SuperToken model sync mapping", () => {
    test("keeps credentials while replacing the model snapshot", async () => {
        const [{ syncedSuperTokenChannel }, { createSuperTokenChannel }] = await Promise.all([import("@/services/api/supertoken-authorization"), import("@/stores/use-config-store")]);
        const current = createSuperTokenChannel({
            supertoken: {
                region: "global",
                imageApiKey: "image-key",
                videoApiKey: "video-key",
                resourceApiKey: "resource-key",
                imageModels: ["old-image"],
                videoModels: ["old-video"],
                authorizedAt: 123,
            },
        });
        const next = syncedSuperTokenChannel(
            current,
            {
                image_models: ["adobe-gpt-image-2-count"],
                video_models: ["leonardo-minimax-h3-768p", "leonardo-minimax-h3-2160p"],
                synced_at: 456,
            },
            789,
        );
        expect(next.supertoken).toMatchObject({
            region: "global",
            imageApiKey: "image-key",
            videoApiKey: "video-key",
            resourceApiKey: "resource-key",
            imageModels: ["adobe-gpt-image-2-count"],
            videoModels: ["leonardo-minimax-h3-768p", "leonardo-minimax-h3-2160p"],
            authorizedAt: 123,
            syncedAt: 789,
        });
    });

    test("sends keys only in the protected sync request", async () => {
        const { syncAuthorizedSuperTokenModels } = await import("@/services/api/supertoken-authorization");
        const originalFetch = globalThis.fetch;
        let captured: { input: string; init?: RequestInit } | undefined;
        globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
            captured = { input: String(input), init };
            return new Response(JSON.stringify({ image_models: ["image"], video_models: ["video"], synced_at: 1 }), { status: 200, headers: { "Content-Type": "application/json" } });
        }) as typeof fetch;
        try {
            await syncAuthorizedSuperTokenModels({ region: "cn", imageApiKey: "image-secret", videoApiKey: "video-secret", resourceApiKey: "resource-secret", imageModels: [], videoModels: [], authorizedAt: 1 });
        } finally {
            globalThis.fetch = originalFetch;
        }
        expect(captured?.input).toBe("https://supertoken.cc/api/canvas/authorization/sync");
        expect(new Headers(captured?.init?.headers).get("Authorization")).toBe("Bearer resource-secret");
        expect(JSON.parse(String(captured?.init?.body))).toEqual({ client_id: "infinite-canvas", image_api_key: "image-secret", video_api_key: "video-secret" });
    });

    test("rejects malformed model snapshots instead of clearing local models", async () => {
        const { syncAuthorizedSuperTokenModels } = await import("@/services/api/supertoken-authorization");
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async () => new Response(JSON.stringify({ image_models: null, video_models: ["video"], synced_at: 1 }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;
        try {
            await expect(syncAuthorizedSuperTokenModels({ region: "cn", imageApiKey: "image", videoApiKey: "video", resourceApiKey: "resource", imageModels: ["old-image"], videoModels: ["old-video"], authorizedAt: 1 })).rejects.toThrow("同步响应无效");
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
