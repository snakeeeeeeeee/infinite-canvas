import { describe, expect, test } from "bun:test";

import {
    canUseSuperTokenNativeImageBatch,
    classifySuperTokenVideoModel,
    normalizeSuperTokenReferenceMode,
    normalizeSuperTokenVideoSettings,
    remainingSuperTokenReferenceCapacity,
    resolveSuperTokenVideoModel,
    superTokenImageCapability,
    superTokenImageBatchPlan,
    superTokenReferenceImageFields,
    superTokenUnsupportedModels,
    superTokenVideoCapability,
    superTokenVideoFamilies,
    superTokenVideoResolutions,
    validateSuperTokenVideoSelection,
} from "../src/lib/supertoken-capabilities";

describe("SuperToken video model catalog", () => {
    test("classifies the supported provider and variant SKUs", () => {
        expect(classifySuperTokenVideoModel("adobe-seedance-2.0-fast-720p")).toBe("adobe-seedance-2.0-fast");
        expect(classifySuperTokenVideoModel("leonardo-seedance-2.0-1080p")).toBe("leonardo-seedance-2.0");
        expect(classifySuperTokenVideoModel("leonardo-seedance-2.5-720p")).toBe("leonardo-seedance-2.5");
        expect(classifySuperTokenVideoModel("adobe-seedance-3.0-ultra-1440p")).toBe("adobe-seedance-3.0-ultra");
        expect(classifySuperTokenVideoModel("adobe-kling-3.0-omni-1080p")).toBe("adobe-kling-3.0-omni");
        expect(classifySuperTokenVideoModel("leonardo-minimax-h3-1440p")).toBe("leonardo-minimax-h3");
        expect(classifySuperTokenVideoModel("adobe-veo-3.1-1080p")).toBe("");
        expect(classifySuperTokenVideoModel("grok-imagine-video-15s-720p")).toBe("");
        expect(classifySuperTokenVideoModel("grok-imagine-video-1.5-preview-15s-720p")).toBe("");
    });

    test("discovers returned Seedance families without synthesizing unavailable resolutions", () => {
        const models = ["leonardo-seedance-2.5-480p", "leonardo-seedance-2.5-720p", "leonardo-seedance-2.5-1080p", "adobe-seedance-3.0-ultra-720p", "leonardo-seedance-3.1-pro-2160p"];
        expect(superTokenVideoFamilies(models)).toEqual(["leonardo-seedance-2.5", "adobe-seedance-3.0-ultra", "leonardo-seedance-3.1-pro"]);
        expect(superTokenVideoResolutions("leonardo-seedance-2.5", models)).toEqual(["480p", "720p"]);
        expect(resolveSuperTokenVideoModel("leonardo-seedance-2.5", "720p", models)).toBe("leonardo-seedance-2.5-720p");
        expect(resolveSuperTokenVideoModel("leonardo-seedance-2.5", "1080p", models)).toBe("");
        expect(superTokenUnsupportedModels([], models)).toEqual([]);
    });

    test("intersects families and resolutions with the account model list", () => {
        const models = ["adobe-seedance-2.0-fast-480p", "adobe-seedance-2.0-fast-720p", "adobe-kling-3.0-1080p"];
        expect(superTokenVideoFamilies(models)).toEqual(["adobe-seedance-2.0-fast", "adobe-kling-3.0"]);
        expect(superTokenVideoResolutions("adobe-seedance-2.0-fast", models)).toEqual(["480p", "720p"]);
        expect(resolveSuperTokenVideoModel("adobe-seedance-2.0-fast", "720p", models)).toBe("adobe-seedance-2.0-fast-720p");
    });

    test("excludes Veo and xAI from selectable and unavailable model lists", () => {
        const models = ["adobe-seedance-2.0-fast-720p", "adobe-veo-3.1-720p", "grok-imagine-video-15s-720p"];
        expect(superTokenVideoFamilies(models)).toEqual(["adobe-seedance-2.0-fast"]);
        expect(superTokenUnsupportedModels([], models)).toEqual([]);
    });
});

describe("SuperToken video request capabilities", () => {
    test("encodes Seedance media images as reference_images only", () => {
        const capability = superTokenVideoCapability("adobe-seedance-2.0")!;
        expect(superTokenReferenceImageFields(capability, "media", ["one", "two"])).toEqual({ image: undefined, referenceImages: ["one", "two"] });
        expect(superTokenReferenceImageFields(superTokenVideoCapability("leonardo-seedance-2.5")!, "frame", ["start", "end"])).toEqual({ image: "start", referenceImages: ["end"] });
    });

    test("encodes MiniMax H3 ordinary images with the first item in input.image", () => {
        const capability = superTokenVideoCapability("leonardo-minimax-h3")!;
        expect(superTokenReferenceImageFields(capability, "images", ["one", "two"])).toEqual({ image: "one", referenceImages: ["two"] });
        expect(superTokenReferenceImageFields(capability, "media", ["one", "two"])).toEqual({ image: "one", referenceImages: ["two"] });
    });

    test("enforces H3 media material and audio policy", () => {
        const capability = superTokenVideoCapability("leonardo-minimax-h3")!;
        expect(validateSuperTokenVideoSelection({ capability, duration: 5, aspectRatio: "16:9", referenceMode: "images", images: 0, videos: 0, audios: 0, generateAudio: true })).toBe("当前参考模式缺少必需素材");
        expect(validateSuperTokenVideoSelection({ capability, duration: 5, aspectRatio: "16:9", referenceMode: "media", images: 1, videos: 0, audios: 0, generateAudio: true })).toBe("当前参考模式缺少必需素材");
        expect(validateSuperTokenVideoSelection({ capability, duration: 5, aspectRatio: "16:9", referenceMode: "media", images: 1, videos: 0, audios: 1, generateAudio: false })).toBe("当前模型的成片音轨固定开启");
        expect(validateSuperTokenVideoSelection({ capability, duration: 5, aspectRatio: "16:9", referenceMode: "media", images: 1, videos: 0, audios: 1, generateAudio: true })).toBe("");
    });

    test("rejects unsupported modes and excessive reference counts", () => {
        const kling = superTokenVideoCapability("adobe-kling-3.0")!;
        expect(validateSuperTokenVideoSelection({ capability: kling, duration: 6, aspectRatio: "16:9", referenceMode: "images", images: 2, videos: 0, audios: 0, generateAudio: true })).toBe("当前模型不支持所选参考模式");
        expect(validateSuperTokenVideoSelection({ capability: kling, duration: 6, aspectRatio: "16:9", referenceMode: "frame", images: 3, videos: 0, audios: 0, generateAudio: true })).toBe("参考素材数量超过当前模型限制");

        const leonardo = superTokenVideoCapability("leonardo-seedance-2.0")!;
        expect(validateSuperTokenVideoSelection({ capability: leonardo, duration: 6, aspectRatio: "16:9", referenceMode: "media", images: 4, videos: 3, audios: 1, generateAudio: true })).toBe("");
        expect(validateSuperTokenVideoSelection({ capability: leonardo, duration: 6, aspectRatio: "16:9", referenceMode: "media", images: 5, videos: 3, audios: 0, generateAudio: true })).toBe("参考素材数量超过当前模型限制");

        const seedance25 = superTokenVideoCapability("leonardo-seedance-2.5")!;
        expect(validateSuperTokenVideoSelection({ capability: seedance25, duration: 30, aspectRatio: "16:9", referenceMode: "media", images: 30, videos: 10, audios: 10, generateAudio: true })).toBe("");
        expect(validateSuperTokenVideoSelection({ capability: seedance25, duration: 30, aspectRatio: "16:9", referenceMode: "media", images: 31, videos: 0, audios: 0, generateAudio: true })).toBe("参考素材数量超过当前模型限制");
        expect(validateSuperTokenVideoSelection({ capability: seedance25, duration: 30, aspectRatio: "16:9", referenceMode: "media", images: 0, videos: 10, audios: 1, generateAudio: true })).toBe("");
        expect(validateSuperTokenVideoSelection({ capability: seedance25, duration: 30, aspectRatio: "16:9", referenceMode: "media", images: 0, videos: 0, audios: 1, generateAudio: true })).toBe("参考音频必须搭配图片或视频");
        expect(validateSuperTokenVideoSelection({ capability: seedance25, duration: 30, aspectRatio: "16:9", referenceMode: "frame", images: 2, videos: 0, audios: 0, generateAudio: true })).toBe("");
        expect(validateSuperTokenVideoSelection({ capability: seedance25, duration: 30, aspectRatio: "16:9", referenceMode: "frame", images: 0, videos: 0, audios: 0, generateAudio: true })).toBe("当前参考模式缺少必需素材");
        expect(validateSuperTokenVideoSelection({ capability: seedance25, duration: 31, aspectRatio: "16:9", referenceMode: "media", images: 0, videos: 0, audios: 0, generateAudio: true })).toBe("当前模型不支持所选时长");
        expect(superTokenVideoCapability("leonardo-seedance-3.0")?.duration.max).toBe(15);
    });

    test("calculates remaining capacity from per-type and combined limits", () => {
        const adobe = superTokenVideoCapability("adobe-seedance-2.0")!.referenceModes.media!;
        expect(remainingSuperTokenReferenceCapacity("audio", { images: 9, videos: 3, audios: 0 }, adobe)).toBe(0);
        expect(remainingSuperTokenReferenceCapacity("audio", { images: 8, videos: 2, audios: 0 }, adobe)).toBe(2);

        const leonardo = superTokenVideoCapability("leonardo-seedance-2.0")!.referenceModes.media!;
        expect(remainingSuperTokenReferenceCapacity("video", { images: 4, videos: 2, audios: 0 }, leonardo)).toBe(1);
        expect(remainingSuperTokenReferenceCapacity("image", { images: 3, videos: 3, audios: 0 }, leonardo)).toBe(1);
        expect(remainingSuperTokenReferenceCapacity("audio", { images: 4, videos: 3, audios: 0 }, leonardo)).toBe(1);

        const seedance25 = superTokenVideoCapability("leonardo-seedance-2.5")!.referenceModes.media!;
        expect(remainingSuperTokenReferenceCapacity("image", { images: 29, videos: 10, audios: 10 }, seedance25)).toBe(1);
        expect(remainingSuperTokenReferenceCapacity("video", { images: 30, videos: 9, audios: 10 }, seedance25)).toBe(1);
        expect(remainingSuperTokenReferenceCapacity("audio", { images: 30, videos: 10, audios: 9 }, seedance25)).toBe(1);
    });

    test("falls back to each model's default mode without changing supported modes", () => {
        const kling = superTokenVideoCapability("adobe-kling-3.0")!;
        const adobeSeedance = superTokenVideoCapability("adobe-seedance-2.0")!;
        const leonardoSeedance = superTokenVideoCapability("leonardo-seedance-2.0")!;
        const klingOmni = superTokenVideoCapability("adobe-kling-3.0-omni")!;
        const minimax = superTokenVideoCapability("leonardo-minimax-h3")!;
        expect(normalizeSuperTokenReferenceMode(kling, "media")).toBe("frame");
        expect(normalizeSuperTokenReferenceMode(adobeSeedance, "images")).toBe("media");
        expect(normalizeSuperTokenReferenceMode(leonardoSeedance, "frame")).toBe("media");
        expect(normalizeSuperTokenReferenceMode(klingOmni, "media")).toBe("images");
        expect(normalizeSuperTokenReferenceMode(minimax, undefined)).toBe("images");

        for (const family of ["adobe-seedance-2.0", "adobe-seedance-2.0-fast", "leonardo-seedance-2.0", "leonardo-seedance-2.0-fast", "leonardo-seedance-2.5", "adobe-kling-3.0", "adobe-kling-3.0-omni", "leonardo-minimax-h3"]) {
            const capability = superTokenVideoCapability(family)!;
            for (const mode of ["frame", "images", "media"] as const) {
                expect(capability.referenceModes[normalizeSuperTokenReferenceMode(capability, mode)]).toBeDefined();
            }
        }
    });

    test("resets every supported model family to valid defaults", () => {
        for (const family of ["adobe-seedance-2.0", "adobe-seedance-2.0-fast", "leonardo-seedance-2.0", "leonardo-seedance-2.0-fast", "leonardo-seedance-2.5", "adobe-kling-3.0", "adobe-kling-3.0-omni", "leonardo-minimax-h3"]) {
            const capability = superTokenVideoCapability(family)!;
            const resolutions = capability.fixedResolution ? [capability.fixedResolution] : ["480p", "720p", "1080p"];
            const settings = normalizeSuperTokenVideoSettings(capability, resolutions, { resolution: "1080p", aspectRatio: "1:1", duration: 12, referenceMode: "media", generateAudio: false }, true);
            expect(resolutions).toContain(settings.resolution);
            expect(settings.resolution).toBe(capability.fixedResolution || "480p");
            expect(settings.aspectRatio).toBe("16:9");
            expect(settings.referenceMode).toBe(capability.defaultReferenceMode);
            expect(settings.duration).toBe(capability.duration.values?.[0] || capability.duration.min);
            expect(settings.generateAudio).toBe(true);
        }

        const minimax = normalizeSuperTokenVideoSettings(superTokenVideoCapability("leonardo-minimax-h3")!, ["1440p"], { resolution: "720p", aspectRatio: "1:1", duration: 6, referenceMode: "media", generateAudio: false }, true);
        expect(minimax).toEqual({ resolution: "1440p", aspectRatio: "16:9", duration: 5, referenceMode: "images", generateAudio: true });
        expect(normalizeSuperTokenVideoSettings(superTokenVideoCapability("leonardo-minimax-h3")!, ["1440p"], { resolution: "720p", aspectRatio: "1:1", duration: 6, referenceMode: "media", generateAudio: false })).toEqual(minimax);
    });
});

describe("SuperToken image catalog", () => {
    test("keeps known async models enabled and unknown models unavailable", () => {
        expect(superTokenImageCapability("gemini-3.1-flash-image")?.resolutions).toEqual(["512", "0.5K", "1K", "2K", "4K"]);
        expect(superTokenImageCapability("gemini-3.1-flash-image-preview")).toBeUndefined();
        expect(superTokenUnsupportedModels(["gpt-image-2", "gemini-3.1-flash-image-preview"], ["unknown-video"])).toEqual(["gemini-3.1-flash-image-preview", "unknown-video"]);
    });

    test("uses explicit per-request output limits instead of model-name suffixes", () => {
        expect(superTokenImageCapability("gpt-image-2")).toMatchObject({ family: "gpt-image", provider: "azure", displayResolution: { min: "1K", max: "4K" }, maxOutputsPerRequest: 10 });
        expect(superTokenImageCapability("adobe-gpt-image-2-count")).toMatchObject({ family: "gpt-image", provider: "adobe", positioning: "balanced", displayResolution: { min: "1K", max: "4K" }, maxOutputsPerRequest: 10 });
        expect(superTokenImageCapability("gpt-image-2-count")).toMatchObject({ family: "gpt-image", provider: "third-party", displayResolution: { max: "1.5K" }, maxOutputsPerRequest: 1 });
        expect(superTokenImageCapability("gemini-3.1-flash-image")?.maxOutputsPerRequest).toBe(1);
        expect(superTokenImageCapability("gemini-3.1-flash-image")).toMatchObject({ family: "gemini", alias: "small-banana", positioning: "fast", operations: ["generation", "edit"] });
        expect(superTokenImageCapability("gemini-3-pro-image-count")).toMatchObject({ family: "gemini", alias: "big-banana", positioning: "quality", operations: ["generation", "edit"] });
        expect(canUseSuperTokenNativeImageBatch("adobe-gpt-image-2-count", 4)).toBe(true);
        expect(canUseSuperTokenNativeImageBatch("gpt-image-2-count", 4)).toBe(false);
        expect(superTokenImageBatchPlan("gpt-image-2", 15)).toEqual([10, 5]);
        expect(superTokenImageBatchPlan("gpt-image-2-count", 3)).toEqual([1, 1, 1]);
    });
});
