import { type ReactNode } from "react";
import { Segmented, Slider, Switch } from "antd";
import { useTranslation } from "react-i18next";

import i18n from "@/i18n";
import { ImageSettingsTheme } from "@/components/image-settings-panel";
import { boolConfig, isSeedanceVideoConfig, normalizeSeedanceDuration, normalizeSeedanceRatio, normalizeSeedanceResolution, seedanceDurationOptions, seedancePixelLabel, seedanceRatioOptions, seedanceResolutionOptions } from "@/lib/seedance-video";
import { type CanvasTheme } from "@/lib/canvas-theme";
import { normalizeSuperTokenVideoSettings, superTokenVideoCapability, superTokenVideoPixelLabel, superTokenVideoResolutionTierLabel, superTokenVideoResolutions, type SuperTokenReferenceMode } from "@/lib/supertoken-capabilities";
import { resolveModelRequestConfig, type AiConfig } from "@/stores/use-config-store";
import { clampVideoSeconds, computeVideoSize, inferVideoRatio, parseVideoResolution, readVideoDimensions, VIDEO_SECONDS_MAX, VIDEO_SECONDS_MIN, videoRatioOptions } from "@/lib/media-size";

const resolutionOptions = [
    { value: "480", label: "480p" },
    { value: "720", label: "720p" },
    { value: "1080", label: "1080p" },
];
const videoModeOptions = [
    { value: "frames", labelKey: "frames" },
    { value: "reference", labelKey: "reference" },
];

const seedanceRatioLabelKeys: Record<string, string> = { "16:9": "landscape", "9:16": "portrait", "1:1": "square", "4:3": "standardLandscape", "3:4": "standardPortrait", "21:9": "cinematic", adaptive: "adaptive" };

export const videoResolutionOptions = resolutionOptions.map((item) => ({ value: item.value, label: item.label }));
export const videoSizeOptions = videoRatioOptions.map((item) => ({ value: item.value, get label() { return item.value === "auto" ? i18n.t("settingsPanels.common.auto") : item.value; } }));
export const videoSecondsRange = { min: VIDEO_SECONDS_MIN, max: VIDEO_SECONDS_MAX };

type VideoSettingsPanelProps = {
    config: AiConfig;
    onConfigChange: (key: "vquality" | "size" | "videoSeconds" | "videoGenerateAudio" | "videoWatermark" | "videoReferenceMode" | "videoMode", value: string) => void;
    theme: CanvasTheme;
    showTitle?: boolean;
    className?: string;
};

export function VideoSettingsPanel({ config, onConfigChange, theme, showTitle = true, className = "w-[320px] space-y-4 rounded-2xl px-1 py-0.5" }: VideoSettingsPanelProps) {
    const { t } = useTranslation();
    const requestConfig = resolveModelRequestConfig(config, config.model || config.videoModel);
    if (requestConfig.provider === "supertoken") {
        return <SuperTokenVideoSettingsPanel config={config} onConfigChange={onConfigChange} theme={theme} showTitle={showTitle} className={className} />;
    }
    if (isSeedanceVideoConfig(config)) {
        return <SeedanceVideoSettingsPanel config={config} onConfigChange={onConfigChange} theme={theme} showTitle={showTitle} className={className} />;
    }

    const seconds = Number(clampVideoSeconds(config.videoSeconds || "6"));
    const videoMode = normalizeVideoModeValue(config.videoMode);
    const resolution = parseVideoResolution(config.vquality);
    const selectedRatio = inferVideoRatio(config.size || "auto");
    const dimensions = readVideoDimensions(config.size || "auto", resolution, selectedRatio);
    const applySize = (nextResolution: string, ratio: string) => {
        onConfigChange("vquality", nextResolution);
        onConfigChange("size", computeVideoSize(nextResolution, ratio));
    };
    const selectResolution = (nextResolution: string) => {
        if (selectedRatio === "auto") onConfigChange("vquality", nextResolution);
        else applySize(nextResolution, selectedRatio);
    };

    return (
        <ImageSettingsTheme theme={theme}>
            <div className={className} style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()}>
                {showTitle ? <div className="text-lg font-semibold">{t("settingsPanels.video.title")}</div> : null}
                <SettingGroup title={t("settingsPanels.video.quality")} color={theme.node.muted}>
                    <div className="grid grid-cols-4 gap-2.5">
                        {resolutionOptions.map((item) => (
                            <OptionPill key={item.value} selected={resolution === item.value} theme={theme} onClick={() => selectResolution(item.value)}>
                                {item.label}
                            </OptionPill>
                        ))}
                        <ResolutionInput value={resolution} theme={theme} onChange={selectResolution} />
                    </div>
                </SettingGroup>
                <SettingGroup title={t("settingsPanels.video.size")} color={theme.node.muted}>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5">
                        <DimensionInput prefix="W" value={dimensions.width} disabled={selectedRatio === "auto"} theme={theme} onChange={(value) => updateDimension("width", value, dimensions, onConfigChange)} />
                        <span className="text-lg opacity-45">↔</span>
                        <DimensionInput prefix="H" value={dimensions.height} disabled={selectedRatio === "auto"} theme={theme} onChange={(value) => updateDimension("height", value, dimensions, onConfigChange)} />
                    </div>
                </SettingGroup>
                <SettingGroup title={t("settingsPanels.video.ratio")} color={theme.node.muted}>
                    <div className="grid grid-cols-4 gap-2.5">
                        {videoRatioOptions.map((item) => (
                            <button
                                key={item.value}
                                type="button"
                                className="flex h-[72px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border bg-transparent text-sm transition hover:opacity-80"
                                style={{ borderColor: selectedRatio === item.value ? theme.node.text : theme.node.stroke, color: theme.node.text }}
                                onMouseDown={(event) => event.stopPropagation()}
                                onClick={() => applySize(resolution, item.value)}
                            >
                                <SizePreview width={item.width} height={item.height} color={theme.node.text} />
                                <span>{item.value === "auto" ? t("settingsPanels.common.auto") : item.value}</span>
                            </button>
                        ))}
                    </div>
                </SettingGroup>
                <SettingGroup title={t("settingsPanels.video.seconds")} color={theme.node.muted}>
                    <div className="flex items-center gap-3" onMouseDown={(event) => event.stopPropagation()}>
                        <Slider className="min-w-0 flex-1" min={VIDEO_SECONDS_MIN} max={VIDEO_SECONDS_MAX} step={1} value={seconds} onChange={(value) => onConfigChange("videoSeconds", String(Array.isArray(value) ? value[0] : value))} />
                        <SecondsInput value={seconds} theme={theme} onCommit={(value) => onConfigChange("videoSeconds", String(value))} />
                        <span className="shrink-0 text-sm" style={{ color: theme.node.muted }}>s</span>
                    </div>
                </SettingGroup>
                <SettingGroup title={t("settingsPanels.video.mode")} color={theme.node.muted}>
                    <div className="grid grid-cols-2 gap-2.5">
                        {videoModeOptions.map((item) => (
                            <OptionPill key={item.value} selected={videoMode === item.value} theme={theme} onClick={() => onConfigChange("videoMode", item.value)}>
                                {t(`settingsPanels.video.modes.${item.labelKey}`)}
                            </OptionPill>
                        ))}
                    </div>
                </SettingGroup>
            </div>
        </ImageSettingsTheme>
    );
}

function SuperTokenVideoSettingsPanel({ config, onConfigChange, theme, showTitle, className }: VideoSettingsPanelProps) {
    const { t } = useTranslation();
    const requestConfig = resolveModelRequestConfig(config, config.model || config.videoModel);
    const capability = superTokenVideoCapability(requestConfig.model);
    if (requestConfig.provider !== "supertoken" || !capability) return null;

    const resolutions = superTokenVideoResolutions(capability.family, requestConfig.availableVideoModels);
    const settings = normalizeSuperTokenVideoSettings(capability, resolutions, {
        resolution: config.vquality,
        aspectRatio: config.size,
        duration: Number(config.videoSeconds),
        referenceMode: config.videoReferenceMode,
        generateAudio: boolConfig(config.videoGenerateAudio, true),
    });
    const resolution = settings.resolution;
    const seconds = settings.duration;
    const ratio = settings.aspectRatio;
    const modes = (Object.keys(capability.referenceModes) as SuperTokenReferenceMode[]).filter((mode) => Boolean(capability.referenceModes[mode]));
    const referenceMode = settings.referenceMode;
    const generateAudio = settings.generateAudio;
    const configError = superTokenConfigError(capability, resolutions, resolution, seconds, ratio, referenceMode);
    const durationValues = capability.duration.values;

    return (
        <ImageSettingsTheme theme={theme}>
            <div className={className} style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()}>
                {showTitle ? <div className="text-lg font-semibold">{t("settingsPanels.video.title")}</div> : null}
                {!capability.fixedResolution ? <SettingGroup title={t("settingsPanels.video.resolution")} color={theme.node.muted}>
                    <Segmented
                        block
                        value={resolution}
                        options={resolutions.map((value) => ({
                            label: capability.family === "leonardo-minimax-h3" ? (
                                <span className="flex flex-col py-0.5 leading-tight">
                                    <span className="text-xs font-medium">{superTokenVideoResolutionTierLabel(value)}</span>
                                    <span className="text-[10px] opacity-55">{value}</span>
                                </span>
                            ) : value,
                            value,
                        }))}
                        onChange={(value) => onConfigChange("vquality", String(value).replace(/p$/i, ""))}
                    />
                    {!resolutions.length ? <InlineWarning>{t("settingsPanels.video.noResolution")}</InlineWarning> : null}
                </SettingGroup> : null}
                <SettingGroup title={t("settingsPanels.video.ratio")} color={theme.node.muted}>
                    <div className="grid grid-cols-3 gap-2.5">
                        {capability.aspectRatios.map((value) => {
                            const pixelLabel = superTokenVideoPixelLabel(capability.family, resolution, value);
                            return (
                                <button
                                    key={value}
                                    type="button"
                                    className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border bg-transparent text-sm transition hover:opacity-80 ${pixelLabel ? "h-[72px]" : "h-[64px]"}`}
                                    style={{ borderColor: ratio === value ? theme.node.text : theme.node.stroke, color: theme.node.text }}
                                    onMouseDown={(event) => event.stopPropagation()}
                                    onClick={() => onConfigChange("size", value)}
                                >
                                    <SizePreview width={ratioPreview(value).width} height={ratioPreview(value).height} color={theme.node.text} />
                                    <span>{value}</span>
                                    {pixelLabel ? <span className="text-[10px] leading-none opacity-55">{pixelLabel}</span> : null}
                                </button>
                            );
                        })}
                    </div>
                </SettingGroup>
                <SettingGroup title={t("settingsPanels.video.duration")} color={theme.node.muted}>
                    {durationValues ? (
                        <Segmented block value={seconds} options={durationValues.map((value) => ({ label: `${value}s`, value }))} onChange={(value) => onConfigChange("videoSeconds", String(value))} />
                    ) : (
                        <div className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-3">
                            <Slider min={capability.duration.min} max={capability.duration.max} value={seconds} tooltip={{ formatter: (value) => `${value}s` }} onChange={(value) => onConfigChange("videoSeconds", String(value))} />
                            <NumberInput value={String(seconds)} min={capability.duration.min} max={capability.duration.max} theme={theme} onChange={(value) => onConfigChange("videoSeconds", value)} />
                        </div>
                    )}
                </SettingGroup>
                <SettingGroup title={t("settingsPanels.video.referenceMode")} color={theme.node.muted}>
                    <Segmented
                        block
                        value={referenceMode}
                        options={modes.map((value) => ({ label: referenceModeLabel(capability, value), value }))}
                        onChange={(value) => onConfigChange("videoReferenceMode", String(value))}
                    />
                    <div className="text-xs leading-5" style={{ color: theme.node.muted }}>
                        {referenceModeHint(capability, referenceMode, capability.referenceModes[referenceMode])}
                    </div>
                </SettingGroup>
                {capability.audioPolicy !== "unsupported" ? (
                    <SettingGroup title={t("settingsPanels.video.output")} color={theme.node.muted}>
                        <div className="grid gap-2 rounded-md border p-2.5" style={{ borderColor: theme.node.stroke }}>
                            <SwitchRow label={capability.audioPolicy === "required" ? t("settingsPanels.video.audioRequired") : t("settingsPanels.video.generateAudio")} checked={generateAudio} disabled={capability.audioPolicy === "required"} theme={theme} onChange={(checked) => onConfigChange("videoGenerateAudio", String(checked))} />
                        </div>
                    </SettingGroup>
                ) : null}
                {configError ? <InlineWarning>{configError}</InlineWarning> : null}
            </div>
        </ImageSettingsTheme>
    );
}

function SeedanceVideoSettingsPanel({ config, onConfigChange, theme, showTitle, className }: VideoSettingsPanelProps) {
    const { t } = useTranslation();
    const resolution = normalizeSeedanceResolution(config.vquality);
    const ratio = normalizeSeedanceRatio(config.size);
    const duration = normalizeSeedanceDuration(config.videoSeconds);
    const generateAudio = boolConfig(config.videoGenerateAudio, true);
    const watermark = boolConfig(config.videoWatermark, false);

    return (
        <ImageSettingsTheme theme={theme}>
            <div className={className} style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()}>
                {showTitle ? <div className="text-lg font-semibold">{t("settingsPanels.video.title")}</div> : null}
                <SettingGroup title={t("settingsPanels.video.resolution")} color={theme.node.muted}>
                    <div className="grid grid-cols-3 gap-2.5">
                        {seedanceResolutionOptions.map((item) => (
                            <OptionPill key={item.value} selected={resolution === item.value} theme={theme} onClick={() => onConfigChange("vquality", item.value)}>
                                {item.label}
                            </OptionPill>
                        ))}
                    </div>
                </SettingGroup>
                <SettingGroup title={t("settingsPanels.video.ratio")} color={theme.node.muted}>
                    <div className="grid grid-cols-3 gap-2.5">
                        {seedanceRatioOptions.map((item) => (
                            <button
                                key={item.value}
                                type="button"
                                className="flex h-[68px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border bg-transparent px-1 text-sm transition hover:opacity-80"
                                style={{ borderColor: ratio === item.value ? theme.node.text : theme.node.stroke, color: theme.node.text }}
                                onMouseDown={(event) => event.stopPropagation()}
                                onClick={() => onConfigChange("size", item.value)}
                            >
                                <SizePreview width={ratioPreview(item.value).width} height={ratioPreview(item.value).height} color={theme.node.text} />
                                <span>{i18n.t(`settingsPanels.video.ratios.${seedanceRatioLabelKeys[item.value]}`)}</span>
                                <span className="text-[10px] leading-none opacity-55">{item.value === "adaptive" ? "adaptive" : seedancePixelLabel(resolution, item.value)}</span>
                            </button>
                        ))}
                    </div>
                </SettingGroup>
                <SettingGroup title={t("settingsPanels.video.duration")} color={theme.node.muted}>
                    <div className="grid grid-cols-4 gap-2.5">
                        {seedanceDurationOptions.map((value) => (
                            <OptionPill key={value} selected={duration === value} theme={theme} onClick={() => onConfigChange("videoSeconds", String(value))}>
                                {value === -1 ? t("settingsPanels.video.smart") : `${value}s`}
                            </OptionPill>
                        ))}
                    </div>
                    <NumberInput value={String(duration)} min={-1} max={15} theme={theme} onChange={(value) => onConfigChange("videoSeconds", value)} />
                </SettingGroup>
                <SettingGroup title={t("settingsPanels.video.output")} color={theme.node.muted}>
                    <div className="grid gap-2 rounded-xl border p-2.5" style={{ borderColor: theme.node.stroke }}>
                        <SwitchRow label={t("settingsPanels.video.generateAudio")} checked={generateAudio} theme={theme} onChange={(checked) => onConfigChange("videoGenerateAudio", String(checked))} />
                        <SwitchRow label={t("settingsPanels.video.watermark")} checked={watermark} theme={theme} onChange={(checked) => onConfigChange("videoWatermark", String(checked))} />
                    </div>
                </SettingGroup>
            </div>
        </ImageSettingsTheme>
    );
}

export function videoResolutionLabel(value: string) {
    return `${parseVideoResolution(value)}p`;
}

export function videoSizeLabel(value: string) {
    if (value === "adaptive") return i18n.t("settingsPanels.video.adaptive");
    const ratio = inferVideoRatio(value);
    return ratio === "auto" ? i18n.t("settingsPanels.video.adaptive") : ratio;
}

export function videoSecondsLabel(value: string) {
    if (String(value).trim() === "-1") return i18n.t("settingsPanels.video.smart");
    return `${value || "6"}s`;
}

export function videoModeLabel(value: string) {
    return i18n.t(`settingsPanels.video.modes.${normalizeVideoModeValue(value)}`);
}

export function normalizeVideoModeValue(value: string | undefined) {
    return value === "reference" ? "reference" : "frames";
}

export function normalizeVideoSizeValue(value: string, resolution = "720") {
    if (value === "auto") return "auto";
    if (/^\d+x\d+$/.test(value || "")) return value;
    const ratio = inferVideoRatio(value);
    return ratio === "auto" ? "auto" : computeVideoSize(resolution, ratio);
}

export function normalizeVideoResolutionValue(value: string) {
    return parseVideoResolution(value);
}

function updateDimension(key: "width" | "height", value: number | null, dimensions: { width: number; height: number }, onConfigChange: VideoSettingsPanelProps["onConfigChange"]) {
    const next = Math.max(1, Math.floor(value || dimensions[key] || 720));
    onConfigChange("size", `${key === "width" ? next : dimensions.width}x${key === "height" ? next : dimensions.height}`);
}

function OptionPill({ selected, disabled = false, theme, onClick, children }: { selected: boolean; disabled?: boolean; theme: CanvasTheme; onClick: () => void; children: ReactNode }) {
    return (
        <button type="button" disabled={disabled} className="h-9 cursor-pointer rounded-full border px-2 text-sm transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-35" style={{ background: "transparent", borderColor: selected ? theme.node.text : theme.node.stroke, color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()} onClick={onClick}>
            {children}
        </button>
    );
}

function SettingGroup({ title, color, children }: { title: string; color: string; children: ReactNode }) {
    return (
        <div className="space-y-2.5">
            <div className="text-xs font-medium" style={{ color }}>
                {title}
            </div>
            {children}
        </div>
    );
}

function ResolutionInput({ value, theme, onChange }: { value: string; theme: CanvasTheme; onChange: (value: string) => void }) {
    return (
        <label className="flex h-9 overflow-hidden rounded-full border text-sm" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
            <input type="number" min={1} className="min-w-0 flex-1 bg-transparent px-3 text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" value={value} onChange={(event) => onChange(event.target.value)} onMouseDown={(event) => event.stopPropagation()} />
            <span className="grid w-7 place-items-center pr-1" style={{ color: theme.node.muted }}>
                p
            </span>
        </label>
    );
}

function SecondsInput({ value, theme, onCommit }: { value: number; theme: CanvasTheme; onCommit: (value: number) => void }) {
    const commit = (input: HTMLInputElement) => {
        const next = Number(clampVideoSeconds(input.value));
        input.value = String(next);
        onCommit(next);
    };

    return (
        <label className="flex h-9 w-[68px] shrink-0 overflow-hidden rounded-xl text-sm" style={{ background: theme.node.fill, color: theme.node.text }}>
            <input
                type="number"
                min={VIDEO_SECONDS_MIN}
                max={VIDEO_SECONDS_MAX}
                className="min-w-0 flex-1 bg-transparent px-2 text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                defaultValue={value}
                key={value}
                onBlur={(event) => commit(event.currentTarget)}
                onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                }}
                onMouseDown={(event) => event.stopPropagation()}
            />
        </label>
    );
}

function DimensionInput({ prefix, value, disabled, theme, onChange }: { prefix: string; value: number; disabled: boolean; theme: CanvasTheme; onChange: (value: number | null) => void }) {
    return (
        <label className="flex h-9 overflow-hidden rounded-xl text-sm" style={{ background: theme.node.fill, color: theme.node.text, opacity: disabled ? 0.55 : 1 }}>
            <span className="grid w-9 place-items-center" style={{ color: theme.node.muted }}>
                {prefix}
            </span>
            <input type="number" min={1} disabled={disabled} className="min-w-0 flex-1 bg-transparent px-2 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" value={value || ""} onChange={(event) => onChange(Number(event.target.value) || null)} onMouseDown={(event) => event.stopPropagation()} />
        </label>
    );
}

function SizePreview({ width, height, color }: { width: number; height: number; color: string }) {
    if (!width || !height) return null;
    const longSide = Math.max(width, height);
    const previewWidth = Math.max(10, Math.round((width / longSide) * 26));
    const previewHeight = Math.max(10, Math.round((height / longSide) * 26));
    return <span className="rounded-[3px] border-2" style={{ width: previewWidth, height: previewHeight, borderColor: color }} />;
}

function ratioPreview(ratio: string) {
    if (ratio === "9:16") return { width: 9, height: 16 };
    if (ratio === "2:3") return { width: 2, height: 3 };
    if (ratio === "3:2") return { width: 3, height: 2 };
    if (ratio === "1:1") return { width: 1, height: 1 };
    if (ratio === "4:3") return { width: 4, height: 3 };
    if (ratio === "3:4") return { width: 3, height: 4 };
    if (ratio === "21:9") return { width: 21, height: 9 };
    if (ratio === "adaptive") return { width: 0, height: 0 };
    return { width: 16, height: 9 };
}

function SwitchRow({ label, checked, disabled = false, theme, onChange }: { label: string; checked: boolean; disabled?: boolean; theme: CanvasTheme; onChange: (checked: boolean) => void }) {
    return (
        <div className="flex h-8 items-center justify-between gap-3">
            <span className="text-sm" style={{ color: theme.node.text }}>
                {label}
            </span>
            <span onMouseDown={(event) => event.stopPropagation()}>
                <Switch size="small" checked={checked} disabled={disabled} onChange={onChange} />
            </span>
        </div>
    );
}

function superTokenConfigError(
    capability: NonNullable<ReturnType<typeof superTokenVideoCapability>>,
    resolutions: string[],
    resolution: string,
    seconds: number,
    ratio: string,
    referenceMode: SuperTokenReferenceMode,
) {
    if (!resolutions.includes(resolution)) return i18n.t("settingsPanels.video.invalidResolution");
    if (capability.duration.values ? !capability.duration.values.includes(seconds) : seconds < capability.duration.min || seconds > capability.duration.max) return i18n.t("settingsPanels.video.invalidDuration");
    if (!capability.aspectRatios.includes(ratio)) return i18n.t("settingsPanels.video.invalidRatio");
    if (!capability.referenceModes[referenceMode]) return i18n.t("settingsPanels.video.invalidReferenceMode");
    return "";
}

function referenceModeLabel(capability: NonNullable<ReturnType<typeof superTokenVideoCapability>>, mode: SuperTokenReferenceMode) {
    if (capability.provider === "xAI" && mode === "frame") return i18n.t("settingsPanels.video.referenceModes.singleImage");
    return i18n.t(`settingsPanels.video.referenceModes.${mode}`);
}

function referenceModeHint(capability: NonNullable<ReturnType<typeof superTokenVideoCapability>>, mode: SuperTokenReferenceMode, limits?: { images: number; videos: number; audios: number; total?: number; visualTotal?: number }) {
    if (!limits) return "";
    if (capability.provider === "xAI" && mode === "frame") return i18n.t("settingsPanels.video.singleImageHint");
    if (mode === "frame") return i18n.t("settingsPanels.video.frameHint", { count: limits.images });
    if (mode === "images") return i18n.t("settingsPanels.video.imagesHint", { count: limits.images });
    if (limits.visualTotal) return i18n.t("settingsPanels.video.mediaVisualHint", { images: limits.images, videos: limits.videos, visualTotal: limits.visualTotal, audios: limits.audios });
    return i18n.t("settingsPanels.video.mediaHint", { images: limits.images, videos: limits.videos, audios: limits.audios, total: limits.total || limits.images + limits.videos + limits.audios });
}

function InlineWarning({ children }: { children: ReactNode }) {
    return <div className="rounded-md border border-red-300/70 bg-red-500/5 px-2.5 py-2 text-xs leading-5 text-red-600 dark:border-red-900 dark:text-red-300">{children}</div>;
}

function NumberInput({ value, min, max, theme, onChange }: { value: string; min: number; max: number; theme: CanvasTheme; onChange: (value: string) => void }) {
    return <input type="number" min={min} max={max} className="h-9 rounded-full border bg-transparent px-3 text-center text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" style={{ borderColor: theme.node.stroke, color: theme.node.text, WebkitTextFillColor: theme.node.text }} value={value} onChange={(event) => onChange(event.target.value)} onMouseDown={(event) => event.stopPropagation()} />;
}
