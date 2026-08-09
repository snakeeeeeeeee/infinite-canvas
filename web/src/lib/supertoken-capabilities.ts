import { SUPERTOKEN_BASE_URL } from "@/constant/runtime-config";

export type SuperTokenRegion = "cn" | "global";
export type SuperTokenReferenceMode = "frame" | "images" | "media";
export type SuperTokenAudioPolicy = "optional" | "required" | "unsupported";

export type SuperTokenReferenceLimits = {
    images: number;
    videos: number;
    audios: number;
    total?: number;
    visualTotal?: number;
    minImages?: number;
    minVideos?: number;
    minAudios?: number;
    audioRequiresVisual?: boolean;
    imageLayout?: "primary-first" | "references-only";
};

export type SuperTokenVideoCapability = {
    family: string;
    label: string;
    provider: "Adobe" | "Leonardo";
    duration: { min: number; max: number; values?: number[] };
    aspectRatios: string[];
    referenceModes: Partial<Record<SuperTokenReferenceMode, SuperTokenReferenceLimits>>;
    defaultReferenceMode: SuperTokenReferenceMode;
    audioPolicy: SuperTokenAudioPolicy;
    fixedResolution?: string;
    allowedResolutions?: string[];
};

export type SuperTokenVideoSettings = {
    resolution: string;
    aspectRatio: string;
    duration: number;
    referenceMode: SuperTokenReferenceMode;
    generateAudio: boolean;
};

export type SuperTokenImageCapability = {
    model: string;
    label: string;
    operations: Array<"generation" | "edit">;
    maxImages: number;
    maxOutputsPerRequest: number;
    qualities: string[];
    formats: string[];
    aspectRatios?: string[];
    resolutions?: string[];
    mask: boolean;
};

export const SUPERTOKEN_BASE_URLS: Record<SuperTokenRegion, string> = {
    cn: "https://hk.supertoken.cc",
    global: "https://api.supertoken.cc",
};

const SIX_VIDEO_RATIOS = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];
const GEMINI_IMAGE_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];

export const SUPERTOKEN_VIDEO_CAPABILITIES: SuperTokenVideoCapability[] = [
    {
        family: "adobe-seedance-2.0",
        label: "Seedance 2.0",
        provider: "Adobe",
        duration: { min: 4, max: 15 },
        aspectRatios: SIX_VIDEO_RATIOS,
        referenceModes: {
            frame: { images: 2, videos: 0, audios: 0, total: 2 },
            media: { images: 9, videos: 3, audios: 3, total: 12 },
        },
        defaultReferenceMode: "media",
        audioPolicy: "optional",
    },
    {
        family: "adobe-seedance-2.0-fast",
        label: "Seedance 2.0 Fast",
        provider: "Adobe",
        duration: { min: 4, max: 15 },
        aspectRatios: SIX_VIDEO_RATIOS,
        referenceModes: {
            frame: { images: 2, videos: 0, audios: 0, total: 2 },
            media: { images: 9, videos: 3, audios: 3, total: 12 },
        },
        defaultReferenceMode: "media",
        audioPolicy: "optional",
    },
    {
        family: "leonardo-seedance-2.0",
        label: "Seedance 2.0",
        provider: "Leonardo",
        duration: { min: 4, max: 15 },
        aspectRatios: SIX_VIDEO_RATIOS,
        referenceModes: { media: { images: 4, videos: 3, audios: 1, visualTotal: 7, audioRequiresVisual: true } },
        defaultReferenceMode: "media",
        audioPolicy: "optional",
    },
    {
        family: "leonardo-seedance-2.0-fast",
        label: "Seedance 2.0 Fast",
        provider: "Leonardo",
        duration: { min: 4, max: 15 },
        aspectRatios: SIX_VIDEO_RATIOS,
        referenceModes: { media: { images: 4, videos: 3, audios: 1, visualTotal: 7, audioRequiresVisual: true } },
        defaultReferenceMode: "media",
        audioPolicy: "optional",
    },
    {
        family: "leonardo-seedance-2.5",
        label: "Seedance 2.5",
        provider: "Leonardo",
        duration: { min: 4, max: 30 },
        aspectRatios: SIX_VIDEO_RATIOS,
        referenceModes: {
            frame: { images: 2, videos: 0, audios: 0, total: 2, minImages: 1 },
            media: { images: 30, videos: 10, audios: 10, total: 50, audioRequiresVisual: true },
        },
        defaultReferenceMode: "media",
        audioPolicy: "optional",
        allowedResolutions: ["480p", "720p"],
    },
    {
        family: "adobe-kling-3.0",
        label: "Kling 3.0",
        provider: "Adobe",
        duration: { min: 3, max: 15 },
        aspectRatios: ["16:9", "9:16"],
        referenceModes: { frame: { images: 2, videos: 0, audios: 0, total: 2 } },
        defaultReferenceMode: "frame",
        audioPolicy: "optional",
    },
    {
        family: "adobe-kling-3.0-omni",
        label: "Kling 3.0 Omni",
        provider: "Adobe",
        duration: { min: 3, max: 15 },
        aspectRatios: ["16:9", "9:16"],
        referenceModes: {
            frame: { images: 2, videos: 0, audios: 0, total: 2 },
            images: { images: 3, videos: 0, audios: 0, total: 3 },
        },
        defaultReferenceMode: "images",
        audioPolicy: "optional",
    },
    {
        family: "leonardo-minimax-h3",
        label: "MiniMax H3",
        provider: "Leonardo",
        duration: { min: 5, max: 15 },
        aspectRatios: SIX_VIDEO_RATIOS,
        referenceModes: {
            frame: { images: 2, videos: 0, audios: 0, total: 2 },
            images: { images: 5, videos: 0, audios: 0, total: 5, minImages: 1, imageLayout: "primary-first" },
            media: { images: 5, videos: 0, audios: 3, total: 8, minImages: 1, minAudios: 1, imageLayout: "primary-first" },
        },
        defaultReferenceMode: "images",
        audioPolicy: "required",
        fixedResolution: "1440p",
    },
];

export const SUPERTOKEN_IMAGE_CAPABILITIES: SuperTokenImageCapability[] = [
    { model: "gpt-image-2", label: "GPT Image 2", operations: ["generation", "edit"], maxImages: 10, maxOutputsPerRequest: 10, qualities: ["auto", "low", "medium", "high"], formats: ["png"], mask: true },
    { model: "gpt-image-2-count", label: "GPT Image 2 Count", operations: ["generation", "edit"], maxImages: 10, maxOutputsPerRequest: 1, qualities: ["auto", "low", "medium", "high"], formats: ["png"], mask: true },
    { model: "adobe-gpt-image-2-count", label: "GPT Image 2 Count", operations: ["generation", "edit"], maxImages: 10, maxOutputsPerRequest: 10, qualities: ["auto", "low", "medium", "high"], formats: ["png"], mask: true },
    {
        model: "gemini-3.1-flash-image",
        label: "Gemini 3.1 Flash Image",
        operations: ["generation", "edit"],
        maxImages: 10,
        maxOutputsPerRequest: 1,
        qualities: ["auto"],
        formats: ["png"],
        aspectRatios: GEMINI_IMAGE_RATIOS,
        resolutions: ["512", "0.5K", "1K", "2K", "4K"],
        mask: false,
    },
    {
        model: "gemini-3-pro-image-count",
        label: "Gemini 3 Pro Image Count",
        operations: ["generation", "edit"],
        maxImages: 10,
        maxOutputsPerRequest: 1,
        qualities: ["auto"],
        formats: ["png"],
        aspectRatios: GEMINI_IMAGE_RATIOS,
        resolutions: ["1K", "2K", "4K"],
        mask: false,
    },
];

export function superTokenBaseUrl(region: SuperTokenRegion | undefined) {
    const override = SUPERTOKEN_BASE_URL.trim().replace(/\/+$/, "");
    if (override) return override;
    return SUPERTOKEN_BASE_URLS[region || "cn"];
}

export function superTokenVideoCapability(family: string): SuperTokenVideoCapability | undefined {
    return SUPERTOKEN_VIDEO_CAPABILITIES.find((item) => item.family === family) || dynamicSeedanceCapability(family);
}

export function superTokenImageCapability(model: string) {
    return SUPERTOKEN_IMAGE_CAPABILITIES.find((item) => item.model === model);
}

export function canUseSuperTokenNativeImageBatch(model: string, count: number) {
    const max = superTokenImageCapability(model)?.maxOutputsPerRequest || 1;
    return count > 1 && count <= max;
}

export function superTokenImageBatchPlan(model: string, count: number) {
    const total = Math.max(1, Math.floor(count) || 1);
    const max = superTokenImageCapability(model)?.maxOutputsPerRequest || 1;
    const batches: number[] = [];
    for (let remaining = total; remaining > 0; remaining -= max) batches.push(Math.min(remaining, max));
    return batches;
}

export function remainingSuperTokenReferenceCapacity(kind: "image" | "video" | "audio", counts: { images: number; videos: number; audios: number }, limits: Pick<SuperTokenReferenceLimits, "images" | "videos" | "audios" | "total" | "visualTotal">) {
    const perKind = kind === "image" ? limits.images - counts.images : kind === "video" ? limits.videos - counts.videos : limits.audios - counts.audios;
    const total = limits.total ? limits.total - counts.images - counts.videos - counts.audios : Number.POSITIVE_INFINITY;
    const visual = kind !== "audio" && limits.visualTotal ? limits.visualTotal - counts.images - counts.videos : Number.POSITIVE_INFINITY;
    return Math.max(0, Math.min(perKind, total, visual));
}

export function superTokenModelLabel(model: string) {
    const video = superTokenVideoCapability(model);
    if (video) return `${video.label}（${video.provider}）`;
    const image = superTokenImageCapability(model);
    if (image) return model.startsWith("adobe-") ? `${image.label}（Adobe）` : image.label;
    return model;
}

export function classifySuperTokenVideoModel(modelId: string) {
    const value = modelId.toLowerCase();
    const seedance = value.match(/^((?:adobe|leonardo)-seedance-[a-z0-9]+(?:[.-][a-z0-9]+)*)-[1-9]\d*p$/);
    if (seedance) return seedance[1];
    if (/^adobe-kling-3\.0-omni-\d+p$/.test(value)) return "adobe-kling-3.0-omni";
    if (/^adobe-kling-3\.0-\d+p$/.test(value)) return "adobe-kling-3.0";
    if (/^(?:leonardo-)?minimax-h3-1440p$/.test(value)) return "leonardo-minimax-h3";
    return "";
}

function isExcludedSuperTokenVideoModel(modelId: string) {
    const value = modelId.toLowerCase();
    return /^adobe-veo-/.test(value) || /^grok-imagine-video-/.test(value);
}

export function superTokenVideoFamilies(modelIds: string[]) {
    const available = new Set<string>(modelIds.map(classifySuperTokenVideoModel).filter(Boolean));
    const known = SUPERTOKEN_VIDEO_CAPABILITIES.filter((item) => available.has(item.family)).map((item) => item.family);
    const knownSet = new Set(known);
    return [...known, ...Array.from(available).filter((family) => !knownSet.has(family) && Boolean(superTokenVideoCapability(family)))];
}

export function superTokenVideoResolutions(family: string, modelIds: string[]) {
    const capability = superTokenVideoCapability(family);
    if (capability?.fixedResolution) return [capability.fixedResolution];
    const allowed = capability?.allowedResolutions;
    return modelIds
        .filter((modelId) => classifySuperTokenVideoModel(modelId) === family)
        .map((modelId) => modelId.match(/-(\d+p)$/i)?.[1]?.toLowerCase() || "")
        .filter(Boolean)
        .filter((value) => !allowed || allowed.includes(value))
        .filter((value, index, values) => values.indexOf(value) === index)
        .sort((a, b) => Number(a.replace("p", "")) - Number(b.replace("p", "")));
}

export function resolveSuperTokenVideoModel(family: string, resolution: string, modelIds: string[]) {
    const normalized = `${resolution.replace(/p$/i, "")}p`.toLowerCase();
    const allowed = superTokenVideoCapability(family)?.allowedResolutions;
    if (allowed && !allowed.includes(normalized)) return "";
    const models = modelIds.filter((modelId) => classifySuperTokenVideoModel(modelId) === family);
    return models.find((modelId) => modelId.toLowerCase().endsWith(`-${normalized}`)) || "";
}

function dynamicSeedanceCapability(family: string): SuperTokenVideoCapability | undefined {
    const match = family.match(/^(adobe|leonardo)-seedance-([a-z0-9]+(?:[.-][a-z0-9]+)*)$/i);
    if (!match) return undefined;
    const provider = match[1].toLowerCase() === "adobe" ? "Adobe" : "Leonardo";
    const label = `Seedance ${match[2].split("-").map((part) => part === "fast" ? "Fast" : part).join(" ")}`;
    return provider === "Adobe"
        ? {
              family,
              label,
              provider,
              duration: { min: 4, max: 15 },
              aspectRatios: SIX_VIDEO_RATIOS,
              referenceModes: {
                  frame: { images: 2, videos: 0, audios: 0, total: 2 },
                  media: { images: 9, videos: 3, audios: 3, total: 12 },
              },
              defaultReferenceMode: "media",
              audioPolicy: "optional",
          }
        : {
              family,
              label,
              provider,
              duration: { min: 4, max: 15 },
              aspectRatios: SIX_VIDEO_RATIOS,
              referenceModes: { media: { images: 4, videos: 3, audios: 1, visualTotal: 7, audioRequiresVisual: true } },
              defaultReferenceMode: "media",
              audioPolicy: "optional",
          };
}

export function superTokenSelectableModels(imageModelIds: string[], videoModelIds: string[]) {
    const supportedImages = imageModelIds.filter((model) => Boolean(superTokenImageCapability(model)));
    return [...supportedImages.map((name) => ({ name, capability: "image" as const })), ...superTokenVideoFamilies(videoModelIds).map((name) => ({ name, capability: "video" as const }))];
}

export function superTokenUnsupportedModels(imageModelIds: string[], videoModelIds: string[]) {
    return [...imageModelIds.filter((model) => !superTokenImageCapability(model)), ...videoModelIds.filter((model) => !classifySuperTokenVideoModel(model) && !isExcludedSuperTokenVideoModel(model))];
}

export function defaultSuperTokenReferenceMode(capability: SuperTokenVideoCapability | undefined) {
    if (!capability) return "frame" as const;
    return capability.defaultReferenceMode;
}

export function normalizeSuperTokenReferenceMode(capability: SuperTokenVideoCapability, value: string | undefined): SuperTokenReferenceMode {
    if ((value === "frame" || value === "images" || value === "media") && capability.referenceModes[value]) return value;
    return defaultSuperTokenReferenceMode(capability);
}

export function normalizeSuperTokenVideoSettings(capability: SuperTokenVideoCapability, resolutions: string[], current: Partial<SuperTokenVideoSettings>, reset = false): SuperTokenVideoSettings {
    const normalizedResolutions = resolutions.map((value) => `${value.replace(/p$/i, "")}p`.toLowerCase());
    const defaultResolution = capability.fixedResolution || lowestVideoResolution(normalizedResolutions) || normalizeVideoResolution(current.resolution);
    const currentResolution = normalizeVideoResolution(current.resolution);
    const defaultAspectRatio = capability.aspectRatios.includes("16:9") ? "16:9" : capability.aspectRatios[0];
    const currentAspectRatio = normalizeVideoAspectRatio(current.aspectRatio);
    const defaultDuration = capability.duration.values?.[0] || capability.duration.min;
    const currentDuration = Math.floor(Number(current.duration));
    const durationSupported = capability.duration.values ? capability.duration.values.includes(currentDuration) : currentDuration >= capability.duration.min && currentDuration <= capability.duration.max;
    const defaultReferenceMode = defaultSuperTokenReferenceMode(capability);
    const currentReferenceMode = normalizeSuperTokenReferenceMode(capability, current.referenceMode);
    const defaultGenerateAudio = capability.audioPolicy !== "unsupported";
    const currentGenerateAudio = capability.audioPolicy === "required" ? true : capability.audioPolicy === "unsupported" ? false : (current.generateAudio ?? true);
    const referenceModeSupported = Boolean(current.referenceMode && capability.referenceModes[current.referenceMode]);
    const audioSettingSupported = capability.audioPolicy === "optional" || current.generateAudio === defaultGenerateAudio;
    const useDefaults = reset || !normalizedResolutions.includes(currentResolution) || !capability.aspectRatios.includes(currentAspectRatio) || !durationSupported || !referenceModeSupported || !audioSettingSupported;

    return {
        resolution: useDefaults ? defaultResolution : currentResolution,
        aspectRatio: useDefaults ? defaultAspectRatio : currentAspectRatio,
        duration: useDefaults ? defaultDuration : currentDuration,
        referenceMode: useDefaults ? defaultReferenceMode : currentReferenceMode,
        generateAudio: useDefaults ? defaultGenerateAudio : currentGenerateAudio,
    };
}

function normalizeVideoResolution(value: string | undefined) {
    if (value === "low") return "480p";
    if (value === "medium" || value === "high" || value === "auto") return "720p";
    return `${String(value || "720").replace(/p$/i, "")}p`.toLowerCase();
}

function lowestVideoResolution(resolutions: string[]) {
    return resolutions.reduce((lowest, resolution) => {
        const pixels = Number(resolution.match(/\d+/)?.[0]) || Number.MAX_SAFE_INTEGER;
        const lowestPixels = Number(lowest.match(/\d+/)?.[0]) || Number.MAX_SAFE_INTEGER;
        return pixels < lowestPixels ? resolution : lowest;
    }, resolutions[0] || "");
}

function normalizeVideoAspectRatio(value: string | undefined) {
    if (/^\d+:\d+$/.test(value || "")) return value!;
    const dimensions = value?.match(/^(\d+)x(\d+)$/);
    if (!dimensions) return "16:9";
    const width = Number(dimensions[1]);
    const height = Number(dimensions[2]);
    if (width === height) return "1:1";
    return width > height ? "16:9" : "9:16";
}

export function superTokenReferenceImageFields<T>(capability: SuperTokenVideoCapability, mode: SuperTokenReferenceMode, images: T[]) {
    const primaryFirst = mode === "frame" || capability.referenceModes[mode]?.imageLayout === "primary-first";
    return {
        image: primaryFirst ? images[0] : undefined,
        referenceImages: primaryFirst ? images.slice(1) : images,
    };
}

export function validateSuperTokenVideoSelection(params: { capability: SuperTokenVideoCapability; duration: number; aspectRatio: string; referenceMode: SuperTokenReferenceMode; images: number; videos: number; audios: number; generateAudio: boolean }) {
    const { capability, duration, aspectRatio, referenceMode, images, videos, audios, generateAudio } = params;
    if (capability.duration.values ? !capability.duration.values.includes(duration) : duration < capability.duration.min || duration > capability.duration.max) return "当前模型不支持所选时长";
    if (!capability.aspectRatios.includes(aspectRatio)) return "当前模型不支持所选画幅";
    const limits = capability.referenceModes[referenceMode];
    if (!limits) return "当前模型不支持所选参考模式";
    if (images > limits.images || videos > limits.videos || audios > limits.audios || (limits.total && images + videos + audios > limits.total) || (limits.visualTotal && images + videos > limits.visualTotal)) return "参考素材数量超过当前模型限制";
    if (images < (limits.minImages || 0) || videos < (limits.minVideos || 0) || audios < (limits.minAudios || 0)) return "当前参考模式缺少必需素材";
    if (limits.audioRequiresVisual && audios && !images && !videos) return "参考音频必须搭配图片或视频";
    if (capability.audioPolicy === "required" && !generateAudio) return "当前模型的成片音轨固定开启";
    if (capability.audioPolicy === "unsupported" && generateAudio) return "当前模型不支持生成音轨";
    return "";
}
