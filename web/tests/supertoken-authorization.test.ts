import { beforeAll, describe, expect, test } from "bun:test";

class MemoryStorage implements Storage {
    private values = new Map<string, string>();
    get length() { return this.values.size; }
    clear() { this.values.clear(); }
    getItem(key: string) { return this.values.get(key) ?? null; }
    key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
    removeItem(key: string) { this.values.delete(key); }
    setItem(key: string, value: string) { this.values.set(key, value); }
}

beforeAll(() => {
    if (!("localStorage" in globalThis)) Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage() });
});

describe("SuperToken PKCE and callback validation", () => {
    test("matches the RFC 7636 S256 challenge vector", async () => {
        const { superTokenPkceChallenge } = await import("@/services/api/supertoken-authorization");
        expect(await superTokenPkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    });

    test("accepts only the callback origin, popup source, and exact state", async () => {
        const { isExpectedSuperTokenAuthorizationMessage, SUPERTOKEN_AUTHORIZATION_MESSAGE } = await import("@/services/api/supertoken-authorization");
        const popup = {} as Window;
        const data = { type: SUPERTOKEN_AUTHORIZATION_MESSAGE, state: "expected", code: "one-time-code" };
        expect(isExpectedSuperTokenAuthorizationMessage({ origin: "http://localhost:3000", source: popup, data }, popup, "http://localhost:3000", "expected")).toBe(true);
        expect(isExpectedSuperTokenAuthorizationMessage({ origin: "https://evil.example", source: popup, data }, popup, "http://localhost:3000", "expected")).toBe(false);
        expect(isExpectedSuperTokenAuthorizationMessage({ origin: "http://localhost:3000", source: {} as Window, data }, popup, "http://localhost:3000", "expected")).toBe(false);
        expect(() => isExpectedSuperTokenAuthorizationMessage({ origin: "http://localhost:3000", source: popup, data: { ...data, state: "wrong" } }, popup, "http://localhost:3000", "expected")).toThrow("授权状态校验失败");
    });

    test("maps only one-time callback parameters", async () => {
        const { parseSuperTokenAuthorizationCallback, SUPERTOKEN_AUTHORIZATION_MESSAGE } = await import("@/services/api/supertoken-authorization");
        expect(parseSuperTokenAuthorizationCallback("?code=temporary&state=s1")).toEqual({
            type: SUPERTOKEN_AUTHORIZATION_MESSAGE,
            state: "s1",
            code: "temporary",
            error: undefined,
            errorDescription: undefined,
        });
    });
});

describe("SuperToken authorization channel mapping", () => {
    test("replaces credentials and converts authorization time to milliseconds", async () => {
        const [{ authorizedSuperTokenChannel }, { createSuperTokenChannel }] = await Promise.all([
            import("@/services/api/supertoken-authorization"),
            import("@/stores/use-config-store"),
        ]);
        const current = createSuperTokenChannel({ supertoken: { region: "cn", imageApiKey: "old-image", videoApiKey: "old-video", resourceApiKey: "old-resource", imageModels: ["old-image-model"], videoModels: ["old-video-model"] } });
        const next = authorizedSuperTokenChannel(current, "cn", {
            token_type: "Bearer",
            image_api_key: "new-image",
            video_api_key: "new-video",
            resource_api_key: "new-resource",
            image_models: ["gpt-image-2"],
            video_models: ["adobe-seedance-2.0-720p"],
            authorized_at: 1_800_000_000,
        }, 1234);
        expect(next.supertoken).toMatchObject({ imageApiKey: "new-image", videoApiKey: "new-video", resourceApiKey: "new-resource", syncedAt: 1234, authorizedAt: 1_800_000_000_000 });
        expect(next.models.map((model) => model.name)).toEqual(["gpt-image-2", "adobe-seedance-2.0"]);
    });

    test("preserves valid models from other channels and prefers newly authorized fallbacks", async () => {
        const { configWithChannels, createModelChannel, createSuperTokenChannel, defaultConfig, encodeChannelModel } = await import("@/stores/use-config-store");
        const custom = createModelChannel({ id: "custom", baseUrl: "https://api.example.com", apiKey: "key", models: [{ name: "custom-image", capability: "image" }, { name: "custom-video", capability: "video" }] });
        const supertoken = createSuperTokenChannel({ supertoken: { region: "cn", imageApiKey: "image-key", videoApiKey: "video-key", resourceApiKey: "resource-key", imageModels: ["gpt-image-2"], videoModels: ["adobe-seedance-2.0-720p"] } });
        const current = { ...defaultConfig, channels: [custom], imageModel: encodeChannelModel("custom", "custom-image"), videoModel: "missing" };
        const next = configWithChannels(current, [custom, supertoken], supertoken.id);
        expect(next.imageModel).toBe(encodeChannelModel("custom", "custom-image"));
        expect(next.videoModel).toBe(encodeChannelModel(supertoken.id, "adobe-seedance-2.0"));
    });
});
