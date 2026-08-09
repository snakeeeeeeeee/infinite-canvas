import i18n from "@/i18n";
import { resolveModelRequestConfig, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

export const SEEDANCE_REFERENCE_LIMITS = {
    images: 9,
    videos: 3,
    audios: 3,
    imageMaxBytes: 30 * 1024 * 1024,
    videoMaxBytes: 200 * 1024 * 1024,
    audioMaxBytes: 15 * 1024 * 1024,
};
export const SEEDANCE_VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime"];
export const SEEDANCE_REFERENCE_MAX_DURATION_MS = 15_000;
export const SEEDANCE_REFERENCE_DURATION_TOLERANCE_MS = 300;
export type SuperTokenReferenceDurationPolicy = { minMs: number; maxMs: number; normalizeAfterMs: number; normalizedTotalDurationMs: number; totalMaxMs?: number };

export const seedanceResolutionOptions = [
    { value: "480p", label: "480p" },
    { value: "720p", label: "720p" },
    { value: "1080p", label: "1080p" },
] as const;

export const seedanceRatioOptions = [
    { value: "16:9" },
    { value: "9:16" },
    { value: "1:1" },
    { value: "4:3" },
    { value: "3:4" },
    { value: "21:9" },
    { value: "adaptive" },
] as const;

export const seedanceDurationOptions = [-1, 4, 5, 6, 8, 10, 12, 15] as const;

const seedancePixels = {
    "480p": {
        "16:9": "864x496",
        "4:3": "752x560",
        "1:1": "640x640",
        "3:4": "560x752",
        "9:16": "496x864",
        "21:9": "992x432",
    },
    "720p": {
        "16:9": "1280x720",
        "4:3": "1112x834",
        "1:1": "960x960",
        "3:4": "834x1112",
        "9:16": "720x1280",
        "21:9": "1470x630",
    },
    "1080p": {
        "16:9": "1920x1080",
        "4:3": "1664x1248",
        "1:1": "1440x1440",
        "3:4": "1248x1664",
        "9:16": "1080x1920",
        "21:9": "2206x946",
    },
} as const;

export function isSeedanceVideoConfig(config: AiConfig | Pick<AiConfig, "model" | "videoModel" | "apiFormat">) {
    const requestConfig = "channels" in config ? resolveModelRequestConfig(config, config.model || config.videoModel) : config;
    return requestConfig.apiFormat === "ark";
}

export function normalizeSeedanceResolution(value: string) {
    const normalized = normalizeResolutionToken(value);
    return seedanceResolutionOptions.some((item) => item.value === normalized) ? normalized : "720p";
}

export function normalizeResolutionToken(value: string) {
    if (value === "low") return "480p";
    if (value === "auto" || value === "high" || value === "medium") return "720p";
    const resolution = String(value || "").replace(/p$/i, "") || "720";
    return `${resolution}p`;
}

export function normalizeSeedanceDuration(value: string) {
    if (String(value).trim() === "-1") return -1;
    const seconds = Math.floor(Number(value) || 5);
    return Math.max(4, Math.min(15, seconds));
}

export function normalizeSeedanceRatio(value: string) {
    if (!value || value === "auto" || value === "adaptive") return "adaptive";
    if (seedanceRatioOptions.some((item) => item.value === value)) return value;
    const match = value.match(/^(\d+)x(\d+)$/);
    if (!match) return "adaptive";
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!width || !height) return "adaptive";
    const ratio = width / height;
    const options = [
        ["16:9", 16 / 9],
        ["4:3", 4 / 3],
        ["1:1", 1],
        ["3:4", 3 / 4],
        ["9:16", 9 / 16],
        ["21:9", 21 / 9],
    ] as const;
    return options.reduce((best, item) => (Math.abs(item[1] - ratio) < Math.abs(best[1] - ratio) ? item : best), options[0])[0];
}

export function seedancePixelLabel(resolution: string, ratio: string) {
    const normalizedResolution = normalizeSeedanceResolution(resolution) as keyof typeof seedancePixels;
    const normalizedRatio = normalizeSeedanceRatio(ratio) as keyof (typeof seedancePixels)[typeof normalizedResolution] | "adaptive";
    if (normalizedRatio === "adaptive") return i18n.t("seedance.autoMatch");
    return seedancePixels[normalizedResolution][normalizedRatio] || "";
}

export function boolConfig(value: string | undefined, fallback: boolean) {
    if (value === "true") return true;
    if (value === "false") return false;
    return fallback;
}

export function seedanceReferenceLabel(kind: "image" | "video" | "audio", index: number) {
    return i18n.t(`seedance.references.${kind}`, { index: index + 1 });
}

export function buildSeedancePromptText(prompt: string, images: ReferenceImage[], videos: ReferenceVideo[], audios: ReferenceAudio[]) {
    const labels = [
        ...images.map((_, index) => seedanceReferenceLabel("image", index)),
        ...videos.map((_, index) => seedanceReferenceLabel("video", index)),
        ...audios.map((_, index) => seedanceReferenceLabel("audio", index)),
    ];
    const text = prompt.trim();
    if (!labels.length) return text;
    return i18n.t("seedance.promptPrefix", { labels: labels.join(i18n.t("seedance.separator")), prompt: text });
}

export function seedanceVideoReferenceError(videos: ReferenceVideo[]) {
    let totalDurationMs = 0;
    for (let index = 0; index < videos.length; index += 1) {
        const video = videos[index];
        const label = seedanceReferenceLabel("video", index);
        if (!SEEDANCE_VIDEO_MIME_TYPES.includes(video.type)) return i18n.t("seedance.errors.format", { label });
        if (video.bytes && video.bytes > SEEDANCE_REFERENCE_LIMITS.videoMaxBytes) return i18n.t("seedance.errors.size", { label });
        if (video.durationMs) {
            if (video.durationMs < 2000 || video.durationMs > 15000) return i18n.t("seedance.errors.duration", { label });
            totalDurationMs += video.durationMs;
        }
        if (video.width && video.height) {
            if (video.width < 300 || video.width > 6000 || video.height < 300 || video.height > 6000) return i18n.t("seedance.errors.dimensions", { label });
            const ratio = video.width / video.height;
            if (ratio < 0.4 || ratio > 2.5) return i18n.t("seedance.errors.ratio", { label });
            const pixels = video.width * video.height;
            if (pixels < 640 * 640 || pixels > 3326 * 2494) return i18n.t("seedance.errors.pixels", { label });
        }
    }
    if (totalDurationMs > 15000) return i18n.t("seedance.errors.totalDuration", { max: 15 });
    return "";
}

export function superTokenReferenceDurationPolicy(model: string, kind: "video" | "audio"): SuperTokenReferenceDurationPolicy | undefined {
    if (model.startsWith("adobe-seedance-")) return { minMs: 2000, maxMs: SEEDANCE_REFERENCE_MAX_DURATION_MS + SEEDANCE_REFERENCE_DURATION_TOLERANCE_MS, normalizeAfterMs: SEEDANCE_REFERENCE_MAX_DURATION_MS, normalizedTotalDurationMs: SEEDANCE_REFERENCE_MAX_DURATION_MS, ...(kind === "audio" ? { totalMaxMs: SEEDANCE_REFERENCE_MAX_DURATION_MS } : {}) };
    if (model.startsWith("leonardo-seedance-")) {
        const totalMaxMs = /^leonardo-seedance-2\.5(?:-\d+p)?$/i.test(model) ? 30_200 : 15_000;
        return kind === "video" ? { minMs: 3000, maxMs: 10300, normalizeAfterMs: 10000, normalizedTotalDurationMs: 10000, totalMaxMs } : { minMs: 2000, maxMs: 15300, normalizeAfterMs: 15000, normalizedTotalDurationMs: 15000, totalMaxMs };
    }
    if (kind === "audio" && model.startsWith("leonardo-minimax-h3")) return { minMs: 2000, maxMs: 15300, normalizeAfterMs: 15000, normalizedTotalDurationMs: 15000, totalMaxMs: 15000 };
    return undefined;
}

export function effectiveReferenceDurationMs(durationMs: number, policy: SuperTokenReferenceDurationPolicy) {
    return durationMs > policy.normalizeAfterMs && durationMs <= policy.maxMs ? policy.normalizedTotalDurationMs : durationMs;
}

export function superTokenReferenceDurationError(model: string, videos: ReferenceVideo[], audios: ReferenceAudio[]) {
    const videoPolicy = superTokenReferenceDurationPolicy(model, "video");
    const audioPolicy = superTokenReferenceDurationPolicy(model, "audio");
    for (let index = 0; index < videos.length; index += 1) {
        const durationMs = videos[index].durationMs;
        if (durationMs && videoPolicy && (durationMs < videoPolicy.minMs || durationMs > videoPolicy.maxMs)) return i18n.t("seedance.errors.referenceDuration", { label: seedanceReferenceLabel("video", index), min: videoPolicy.minMs / 1000, max: videoPolicy.maxMs / 1000 });
    }
    for (let index = 0; index < audios.length; index += 1) {
        const durationMs = audios[index].durationMs;
        if (durationMs && audioPolicy && (durationMs < audioPolicy.minMs || durationMs > audioPolicy.maxMs)) return i18n.t("seedance.errors.referenceDuration", { label: seedanceReferenceLabel("audio", index), min: audioPolicy.minMs / 1000, max: audioPolicy.maxMs / 1000 });
    }
    if (videoPolicy?.totalMaxMs && videos.reduce((total, item) => total + effectiveReferenceDurationMs(item.durationMs || 0, videoPolicy), 0) > videoPolicy.totalMaxMs) return i18n.t("seedance.errors.totalDuration", { max: videoPolicy.totalMaxMs / 1000 });
    if (audioPolicy?.totalMaxMs && audios.reduce((total, item) => total + effectiveReferenceDurationMs(item.durationMs || 0, audioPolicy), 0) > audioPolicy.totalMaxMs) return i18n.t("seedance.errors.totalAudioDuration", { max: audioPolicy.totalMaxMs / 1000 });
    return "";
}

export function seedanceVideoReferenceHint() {
    return i18n.t("seedance.referenceHint");
}
