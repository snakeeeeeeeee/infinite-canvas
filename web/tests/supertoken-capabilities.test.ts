import { describe, expect, test } from "bun:test";

import {
    classifySuperTokenVideoModel,
    normalizeSuperTokenReferenceMode,
    normalizeSuperTokenVideoSettings,
    resolveSuperTokenVideoModel,
    superTokenImageCapability,
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
        expect(classifySuperTokenVideoModel("adobe-kling-3.0-omni-1080p")).toBe("adobe-kling-3.0-omni");
        expect(classifySuperTokenVideoModel("leonardo-minimax-h3-1440p")).toBe("leonardo-minimax-h3");
        expect(classifySuperTokenVideoModel("adobe-veo-3.1-1080p")).toBe("");
        expect(classifySuperTokenVideoModel("grok-imagine-video-15s-720p")).toBe("");
        expect(classifySuperTokenVideoModel("grok-imagine-video-1.5-preview-15s-720p")).toBe("");
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
    });

    test("encodes MiniMax H3 ordinary images with the first item in input.image", () => {
        const capability = superTokenVideoCapability("leonardo-minimax-h3")!;
        expect(superTokenReferenceImageFields(capability, "images", ["one", "two"])).toEqual({ image: "one", referenceImages: ["two"] });
        expect(superTokenReferenceImageFields(capability, "media", ["one", "two"])).toEqual({ image: "one", referenceImages: ["two"] });
    });

    test("enforces H3 media material and audio policy", () => {
        const capability = superTokenVideoCapability("leonardo-minimax-h3")!;
        expect(validateSuperTokenVideoSelection({ capability, duration: 5, aspectRatio: "16:9", referenceMode: "media", images: 1, videos: 0, audios: 0, generateAudio: true })).toBe("当前参考模式缺少必需素材");
        expect(validateSuperTokenVideoSelection({ capability, duration: 5, aspectRatio: "16:9", referenceMode: "media", images: 1, videos: 0, audios: 1, generateAudio: false })).toBe("当前模型的成片音轨固定开启");
        expect(validateSuperTokenVideoSelection({ capability, duration: 5, aspectRatio: "16:9", referenceMode: "media", images: 1, videos: 0, audios: 1, generateAudio: true })).toBe("");
    });

    test("rejects unsupported modes and excessive reference counts", () => {
        const kling = superTokenVideoCapability("adobe-kling-3.0")!;
        expect(validateSuperTokenVideoSelection({ capability: kling, duration: 6, aspectRatio: "16:9", referenceMode: "images", images: 2, videos: 0, audios: 0, generateAudio: true })).toBe("当前模型不支持所选参考模式");
        expect(validateSuperTokenVideoSelection({ capability: kling, duration: 6, aspectRatio: "16:9", referenceMode: "frame", images: 3, videos: 0, audios: 0, generateAudio: true })).toBe("参考素材数量超过当前模型限制");
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

        for (const family of ["adobe-seedance-2.0", "adobe-seedance-2.0-fast", "leonardo-seedance-2.0", "leonardo-seedance-2.0-fast", "adobe-kling-3.0", "adobe-kling-3.0-omni", "leonardo-minimax-h3"]) {
            const capability = superTokenVideoCapability(family)!;
            for (const mode of ["frame", "images", "media"] as const) {
                expect(capability.referenceModes[normalizeSuperTokenReferenceMode(capability, mode)]).toBeDefined();
            }
        }
    });

    test("resets every supported model family to valid defaults", () => {
        for (const family of ["adobe-seedance-2.0", "adobe-seedance-2.0-fast", "leonardo-seedance-2.0", "leonardo-seedance-2.0-fast", "adobe-kling-3.0", "adobe-kling-3.0-omni", "leonardo-minimax-h3"]) {
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
});
