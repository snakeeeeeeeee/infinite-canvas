import { superTokenImageConfigPatch, type AiConfig } from "@/stores/use-config-store";
import type { CanvasNodeMetadata } from "@/types/canvas";

export function canvasImageModelPatch(config: AiConfig, model: string): Partial<CanvasNodeMetadata> {
    const defaults = superTokenImageConfigPatch(config, model);
    return defaults ? { model, ...defaults } : { model };
}

export function normalizeCanvasImageConfig(config: AiConfig) {
    return { ...config, ...(superTokenImageConfigPatch(config, config.model) || {}) };
}
