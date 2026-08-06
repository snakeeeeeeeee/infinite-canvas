import { superTokenVideoConfigPatch, type AiConfig } from "@/stores/use-config-store";
import type { CanvasNodeMetadata } from "@/types/canvas";

export function canvasVideoModelPatch(config: AiConfig, model: string): Partial<CanvasNodeMetadata> {
    const defaults = superTokenVideoConfigPatch(config, model, true);
    if (!defaults) return { model };
    return {
        model,
        vquality: defaults.vquality,
        size: defaults.size,
        seconds: defaults.videoSeconds,
        videoReferenceMode: defaults.videoReferenceMode,
        generateAudio: defaults.videoGenerateAudio,
    };
}

export function normalizeCanvasVideoConfig(config: AiConfig) {
    return { ...config, ...(superTokenVideoConfigPatch(config, config.model) || {}) };
}
