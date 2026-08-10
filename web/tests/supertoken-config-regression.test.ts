import { describe, expect, test } from "bun:test";

const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
    value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        clear: () => values.clear(),
        key: (index: number) => Array.from(values.keys())[index] ?? null,
        get length() {
            return values.size;
        },
    } satisfies Storage,
});

const {
    createModelChannel,
    createSuperTokenChannel,
    defaultConfig,
    encodeChannelModel,
    resolveModelRequestConfig,
    selectableModelsByCapability,
    superTokenVideoConfigPatch,
} = await import("../src/stores/use-config-store");
const { resetInterruptedGeneration } = await import("../src/lib/canvas/canvas-generation-helpers");
const { CanvasNodeType } = await import("../src/types/canvas");

describe("SuperToken channel configuration", () => {
    test("starts new installs without channels or models", () => {
        expect(defaultConfig.channels).toEqual([]);
        expect(defaultConfig.models).toEqual([]);
        expect(defaultConfig.imageModel).toBe("");
        expect(defaultConfig.videoModel).toBe("");
        expect(defaultConfig.count).toBe("1");
        expect(defaultConfig.canvasImageCount).toBe("1");
    });

    test("enables SuperToken image and video models independently", () => {
        const imageOnly = createSuperTokenChannel({
            supertoken: { region: "cn", imageApiKey: "image-key", videoApiKey: "", resourceApiKey: "resource-key", imageModels: ["gpt-image-2"], videoModels: ["adobe-kling-3.0-720p"] },
        });
        const imageConfig = { ...defaultConfig, channels: [imageOnly] };
        expect(selectableModelsByCapability(imageConfig, "image")).toEqual([encodeChannelModel("supertoken", "gpt-image-2")]);
        expect(selectableModelsByCapability(imageConfig, "video")).toEqual([]);

        const videoOnly = createSuperTokenChannel({
            supertoken: { region: "cn", imageApiKey: "", videoApiKey: "video-key", resourceApiKey: "resource-key", imageModels: ["gpt-image-2"], videoModels: ["adobe-kling-3.0-720p"] },
        });
        const videoConfig = { ...defaultConfig, channels: [videoOnly] };
        expect(selectableModelsByCapability(videoConfig, "image")).toEqual([]);
        expect(selectableModelsByCapability(videoConfig, "video")).toEqual([encodeChannelModel("supertoken", "adobe-kling-3.0")]);

        const missingResource = createSuperTokenChannel({ ...imageOnly, supertoken: { ...imageOnly.supertoken!, resourceApiKey: "" } });
        expect(selectableModelsByCapability({ ...defaultConfig, channels: [missingResource] })).toEqual([]);
    });

    test("only exposes models from configured custom channels", () => {
        const incomplete = createModelChannel({ models: [{ name: "custom-image", capability: "image" }] });
        expect(selectableModelsByCapability({ ...defaultConfig, channels: [incomplete] }, "image")).toEqual([]);

        const ready = createModelChannel({ ...incomplete, apiKey: "custom-key" });
        expect(selectableModelsByCapability({ ...defaultConfig, channels: [ready] }, "image")).toEqual([encodeChannelModel(ready.id, "custom-image")]);
    });

    test("normalizes a legacy custom channel without changing its request path", () => {
        const channel = createModelChannel({
            id: "legacy",
            name: "Legacy",
            baseUrl: "https://legacy.example.com/v1",
            apiKey: "legacy-key",
            apiFormat: "gemini",
            models: [{ name: "legacy-image", capability: "image", script: "return request;" }],
        });
        const model = encodeChannelModel(channel.id, "legacy-image");
        const request = resolveModelRequestConfig({ ...defaultConfig, channels: [channel], models: [model], model, imageModel: model }, model);
        expect(channel).toMatchObject({ provider: "custom", baseUrl: "https://legacy.example.com/v1", apiKey: "legacy-key", apiFormat: "gemini" });
        expect(channel.models[0].script).toBe("return request;");
        expect(request).toMatchObject({ provider: "custom", baseUrl: "https://legacy.example.com/v1", apiKey: "legacy-key", apiFormat: "gemini" });
    });

    test("routes image and video models to separate keys with an optional Canvas route override", () => {
        const channel = createSuperTokenChannel({
            id: "supertoken",
            baseUrl: "https://untrusted.example.com",
            supertoken: {
                region: "global",
                imageApiKey: "image-key",
                videoApiKey: "video-key",
                resourceApiKey: "resource-key",
                imageModels: ["gpt-image-2"],
                videoModels: ["adobe-kling-3.0-720p"],
            },
        });
        const config = { ...defaultConfig, channels: [channel], models: channel.models.map((model) => encodeChannelModel(channel.id, model.name)) };
        const image = resolveModelRequestConfig(config, encodeChannelModel(channel.id, "gpt-image-2"));
        const video = resolveModelRequestConfig(config, encodeChannelModel(channel.id, "adobe-kling-3.0"));
        expect(channel.baseUrl).toBe("https://api.supertoken.cc");
        expect(image).toMatchObject({ provider: "supertoken", apiKey: "image-key", resourceApiKey: "resource-key", baseUrl: "https://api.supertoken.cc" });
        expect(video).toMatchObject({ provider: "supertoken", apiKey: "video-key", resourceApiKey: "resource-key", baseUrl: "https://api.supertoken.cc" });
        expect(resolveModelRequestConfig({ ...config, supertokenRegion: "cn" }, encodeChannelModel(channel.id, "gpt-image-2"))).toMatchObject({ provider: "supertoken", baseUrl: "https://hk.supertoken.cc" });
        expect(superTokenVideoConfigPatch(config, encodeChannelModel(channel.id, "adobe-kling-3.0"), true)).toEqual({ vquality: "720", size: "16:9", videoSeconds: "3", videoReferenceMode: "frame", videoGenerateAudio: "true" });
    });

    test("uses the recorded channel id when custom and SuperToken models share a name", () => {
        const custom = createModelChannel({ id: "default", baseUrl: "https://api.openai.com", apiKey: "openai-key", models: [{ name: "gpt-image-2", capability: "image" }] });
        const supertoken = createSuperTokenChannel({
            id: "supertoken",
            supertoken: { region: "cn", imageApiKey: "image-key", videoApiKey: "", resourceApiKey: "resource-key", imageModels: ["gpt-image-2"], videoModels: [] },
        });
        const config = { ...defaultConfig, channels: [custom, supertoken] };
        expect(resolveModelRequestConfig(config, "gpt-image-2").provider).toBe("custom");
        expect(resolveModelRequestConfig(config, encodeChannelModel("supertoken", "gpt-image-2"))).toMatchObject({ provider: "supertoken", apiKey: "image-key", resourceApiKey: "resource-key" });
    });
});

describe("Canvas durable task recovery", () => {
    test("keeps a loading origin active when a child owns a durable task", () => {
        const nodes = [
            { id: "origin", type: CanvasNodeType.Config, title: "Config", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { status: "loading" as const } },
            { id: "result", type: CanvasNodeType.Image, title: "Result", position: { x: 120, y: 0 }, width: 100, height: 100, metadata: { status: "loading" as const, asyncTaskId: "task-1", asyncOriginNodeId: "origin" } },
            { id: "interrupted", type: CanvasNodeType.Image, title: "Interrupted", position: { x: 240, y: 0 }, width: 100, height: 100, metadata: { status: "loading" as const } },
        ];
        const restored = resetInterruptedGeneration(nodes);
        expect(restored[0].metadata?.status).toBe("loading");
        expect(restored[1].metadata?.status).toBe("loading");
        expect(restored[2].metadata?.status).toBe("error");
    });
});
