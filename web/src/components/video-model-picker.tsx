import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Drawer } from "antd";
import type { TFunction } from "i18next";
import { Check, ChevronDown, CircleUserRound, Image, Music2, Settings2, Video } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { superTokenVideoCapability, superTokenVideoResolutionTierLabel, superTokenVideoResolutions, type SuperTokenVideoCapability } from "@/lib/supertoken-capabilities";
import { decodeChannelModel, modelOptionLabel, modelOptionName, selectableModelsByCapability, type AiConfig } from "@/stores/use-config-store";

type VideoModelPickerProps = {
    config: AiConfig;
    value?: string;
    onChange: (model: string) => void;
    className?: string;
    fullWidth?: boolean;
    compact?: boolean;
    placeholder?: string;
    onMissingConfig?: () => void;
};

type FaceMode = "general" | "human";
type FaceSupport = "supported" | "unsupported" | "unknown";
type FamilyId = "seedance" | "kling" | "minimax" | "grok" | "other";
type ReferenceStat = { kind: "image" | "video" | "audio" | "frame"; label: string };

type VideoOption = {
    value: string;
    modelLabel: string;
    provider: string;
    family: FamilyId;
    faceSupport: FaceSupport;
    summary: string;
    detail: string;
    references: ReferenceStat[];
    preview: boolean;
};

const FAMILY_IDS: FamilyId[] = ["seedance", "kling", "minimax", "grok", "other"];

export function VideoModelPicker({ config, value, onChange, className, fullWidth = false, compact = false, placeholder, onMissingConfig }: VideoModelPickerProps) {
    const { t } = useTranslation();
    const pickerId = useId();
    const isMobile = useMobilePicker();
    const [open, setOpen] = useState(false);
    const [faceMode, setFaceMode] = useState<FaceMode>("general");
    const [family, setFamily] = useState<FamilyId>("seedance");
    const options = useMemo(() => selectableModelsByCapability(config, "video"), [config]);
    const items = useMemo(() => options.map((option) => buildVideoOption(config, option, t)), [config, options, t]);
    const current = value && options.includes(value) ? value : "";
    const selected = items.find((item) => item.value === current);
    const pickerPlaceholder = placeholder || t(options.length ? "settingsPanels.model.select" : "settingsPanels.model.configure");

    const changeOpen = (nextOpen: boolean) => {
        if (nextOpen && !options.length && onMissingConfig) {
            onMissingConfig();
            setOpen(false);
            return;
        }
        if (nextOpen) {
            window.dispatchEvent(new CustomEvent("model-picker-open", { detail: pickerId }));
            setFaceMode("general");
            if (selected) setFamily(selected.family);
        }
        setOpen(nextOpen);
    };

    useCloseOnOtherPicker(pickerId, setOpen);

    const trigger = (
        <button
            type="button"
            className={cn(
                "canvas-composer-model-picker flex h-8 max-w-full items-center gap-2 rounded-full border border-input bg-transparent px-3 text-sm font-normal shadow-sm transition-colors outline-none",
                fullWidth ? "w-full min-w-0 justify-start" : "w-fit min-w-[9rem] justify-start",
                "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20",
                open && "border-ring ring-2 ring-ring/20",
                className,
            )}
            onClick={isMobile ? () => changeOpen(true) : undefined}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            aria-haspopup="dialog"
            aria-expanded={open}
            title={selected ? `${selected.modelLabel} · ${selected.provider}` : pickerPlaceholder}
        >
            {selected ? <Video className="size-4 shrink-0 opacity-70" /> : <Settings2 className="size-4 shrink-0 opacity-70" />}
            <span className="canvas-model-picker-text min-w-0 flex-1 truncate text-left">
                {selected ? `${selected.modelLabel} · ${selected.provider}` : pickerPlaceholder}
            </span>
            <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
    );

    const panel = (
        <VideoPickerPanel
            items={items}
            selectedValue={current}
            faceMode={faceMode}
            family={family}
            mobile={isMobile}
            compact={compact && !isMobile}
            onFaceModeChange={(mode) => {
                setFaceMode(mode);
                const available = availableFamilies(items, mode);
                if (!available.includes(family)) setFamily(available[0] || "other");
            }}
            onFamilyChange={setFamily}
            onSelect={(nextValue) => {
                onChange(nextValue);
                setOpen(false);
            }}
        />
    );

    if (isMobile) {
        return (
            <>
                {trigger}
                <Drawer
                    title={t("settingsPanels.videoModelPicker.title")}
                    placement="bottom"
                    height="80dvh"
                    open={open}
                    onClose={() => changeOpen(false)}
                    zIndex={1300}
                    styles={{ body: { padding: 0, overflow: "hidden" } }}
                >
                    {panel}
                </Drawer>
            </>
        );
    }

    return (
        <PopoverPrimitive.Root open={open} onOpenChange={changeOpen}>
            <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
            <PopoverPrimitive.Portal>
                <PopoverPrimitive.Content
                    data-canvas-no-zoom
                    side="bottom"
                    align="start"
                    sideOffset={8}
                    collisionPadding={12}
                    className={cn(
                        "z-[1200] origin-[var(--radix-popover-content-transform-origin)] rounded-xl border border-border/70 bg-popover text-popover-foreground shadow-2xl outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2",
                        compact ? "w-[min(560px,calc(100vw-24px))]" : "w-[min(720px,calc(100vw-24px))]",
                    )}
                    onPointerDown={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                >
                    {panel}
                </PopoverPrimitive.Content>
            </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
    );
}

function VideoPickerPanel({ items, selectedValue, faceMode, family, mobile, compact, onFaceModeChange, onFamilyChange, onSelect }: {
    items: VideoOption[];
    selectedValue: string;
    faceMode: FaceMode;
    family: FamilyId;
    mobile: boolean;
    compact: boolean;
    onFaceModeChange: (mode: FaceMode) => void;
    onFamilyChange: (family: FamilyId) => void;
    onSelect: (value: string) => void;
}) {
    const { t } = useTranslation();
    const visibleItems = items.filter((item) => faceMode === "general" || item.faceSupport === "supported");
    const families = availableFamilies(items, faceMode);
    const activeFamily = families.includes(family) ? family : families[0] || "other";
    const groups = groupOptions(visibleItems.filter((item) => item.family === activeFamily), activeFamily);

    return (
        <section className={cn("flex min-h-0 flex-col overflow-hidden", mobile ? "h-full" : compact ? "max-h-[min(420px,var(--radix-popover-content-available-height))]" : "max-h-[min(540px,var(--radix-popover-content-available-height))]")}>
            {!mobile ? (
                <div className={cn("border-b border-border/70", compact ? "px-3 py-2" : "px-4 py-3")}>
                    <FaceFilter value={faceMode} compact={compact} onChange={onFaceModeChange} />
                </div>
            ) : (
                <div className="border-b border-border/70 px-4 py-3">
                    <FaceFilter value={faceMode} compact={false} onChange={onFaceModeChange} />
                </div>
            )}

            <div className={cn("flex shrink-0 gap-1 overflow-x-auto border-b border-border/70", compact ? "px-2 py-1.5" : "px-3 py-2 sm:px-4")}>
                {families.map((familyId) => {
                    const name = t(`settingsPanels.videoModelPicker.families.${familyId}.name`);
                    const caption = t(`settingsPanels.videoModelPicker.families.${familyId}.caption`);
                    return (
                        <button
                            key={familyId}
                            type="button"
                            onClick={() => onFamilyChange(familyId)}
                            className={cn(
                                "flex flex-1 items-center justify-center rounded-md transition-colors",
                                compact ? "min-w-[96px] gap-1.5 px-2 py-1.5 text-[13px]" : "min-w-[112px] gap-2 px-3 py-2 text-sm",
                                activeFamily === familyId ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                            )}
                        >
                            {familyId === "grok" ? <img src="/icons/grok.svg" alt="" className="size-4 shrink-0 dark:invert" /> : null}
                            <span className="whitespace-nowrap font-medium">{name}</span>
                            {caption ? <span className={cn("whitespace-nowrap opacity-65", compact ? "text-[11px]" : "text-xs")}>{caption}</span> : null}
                        </button>
                    );
                })}
            </div>

            <div className={cn("min-h-0 flex-1 overflow-y-auto", compact ? "px-2 py-1.5" : "px-3 py-2 sm:px-4")}>
                {groups.length ? groups.map((group) => (
                    <div key={group.label} className={cn("border-b border-border/60 last:border-0", compact ? "py-1.5" : "py-2")}>
                        <div className={cn("flex items-center justify-between gap-3", compact ? "px-1.5 pb-1.5 pt-0.5" : "px-2 pb-2 pt-1")}>
                            <h3 className={cn("font-semibold", compact ? "text-[13px]" : "text-sm")}>{group.label}</h3>
                            <span className={cn("text-right text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>{group.summary}</span>
                        </div>
                        <div className={cn("grid", compact ? "gap-1.5" : "gap-2", group.items.length > 1 && "sm:grid-cols-2")}>
                            {group.items.map((item) => (
                                <ModelOptionCard key={item.value} item={item} selected={item.value === selectedValue} compact={compact} onSelect={onSelect} />
                            ))}
                        </div>
                    </div>
                )) : (
                    <div className="flex min-h-40 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                        {t("settingsPanels.videoModelPicker.empty")}
                    </div>
                )}
            </div>
        </section>
    );
}

function FaceFilter({ value, compact, onChange }: { value: FaceMode; compact: boolean; onChange: (mode: FaceMode) => void }) {
    const { t } = useTranslation();
    return (
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/60 p-1">
            <FilterButton active={value === "general"} label={t("settingsPanels.videoModelPicker.general")} compact={compact} onClick={() => onChange("general")} />
            <FilterButton active={value === "human"} label={t("settingsPanels.videoModelPicker.human")} compact={compact} icon={<CircleUserRound className="size-4" />} onClick={() => onChange("human")} />
        </div>
    );
}

function FilterButton({ active, label, compact, icon, onClick }: { active: boolean; label: string; compact: boolean; icon?: ReactNode; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn("flex items-center justify-center gap-2 rounded-md font-medium transition-colors", compact ? "h-8 text-[13px]" : "h-9 text-sm", active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
            {icon}
            {label}
        </button>
    );
}

function ModelOptionCard({ item, selected, compact, onSelect }: { item: VideoOption; selected: boolean; compact: boolean; onSelect: (value: string) => void }) {
    const { t } = useTranslation();
    return (
        <button
            type="button"
            aria-pressed={selected}
            title={t("settingsPanels.videoModelPicker.chooseProvider", { provider: item.provider })}
            onClick={() => onSelect(item.value)}
            className={cn(
                "group flex w-full items-start rounded-lg border text-left transition-colors",
                compact ? "min-h-16 gap-2 px-2.5 py-2" : "min-h-[82px] gap-3 px-3 py-2.5",
                selected ? "border-foreground bg-accent" : "border-border/80 hover:border-foreground/35 hover:bg-accent/60",
            )}
        >
            <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={cn("font-medium", compact ? "text-[13px]" : "text-sm")}>{item.provider}</span>
                    {item.preview ? <span className={cn("rounded border border-border px-1 font-medium text-muted-foreground", compact ? "text-[10px]" : "text-[11px]")}>{t("settingsPanels.videoModelPicker.preview")}</span> : null}
                    <FaceBadge support={item.faceSupport} compact={compact} />
                    <span className={cn("text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>{item.detail}</span>
                </span>
                {item.references.length ? (
                    <span className={cn("flex flex-wrap gap-y-1 text-muted-foreground", compact ? "mt-1.5 gap-x-2 text-[11px]" : "mt-2 gap-x-3 text-xs")}>
                        {item.references.map((reference) => <ReferenceStatView key={`${reference.kind}-${reference.label}`} stat={reference} compact={compact} />)}
                    </span>
                ) : (
                    <span className={cn("block text-muted-foreground", compact ? "mt-1.5 text-[11px]" : "mt-2 text-xs")}>{item.summary}</span>
                )}
            </span>
            <span className={cn("mt-1 flex shrink-0 items-center justify-center rounded-full border", compact ? "size-[18px]" : "size-5", selected ? "border-foreground bg-foreground text-background" : "border-muted-foreground/55")}>
                {selected ? <Check className={compact ? "size-3" : "size-3.5"} strokeWidth={3} /> : null}
            </span>
        </button>
    );
}

function FaceBadge({ support, compact }: { support: FaceSupport; compact: boolean }) {
    const { t } = useTranslation();
    if (support === "unknown") return <span className={cn("font-medium text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>{t("settingsPanels.videoModelPicker.faceUnknown")}</span>;
    return (
        <span className={cn("font-medium", compact ? "text-[11px]" : "text-xs", support === "supported" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
            {t(support === "supported" ? "settingsPanels.videoModelPicker.faceSupported" : "settingsPanels.videoModelPicker.faceUnsupported")}
        </span>
    );
}

function ReferenceStatView({ stat, compact }: { stat: ReferenceStat; compact: boolean }) {
    const Icon = stat.kind === "video" ? Video : stat.kind === "audio" ? Music2 : Image;
    return <span className="inline-flex items-center gap-1"><Icon className={compact ? "size-3" : "size-3.5"} />{stat.label}</span>;
}

function buildVideoOption(config: AiConfig, value: string, t: TFunction): VideoOption {
    const model = modelOptionName(value);
    const capability = superTokenVideoCapability(model);
    const family = modelFamily(model);
    const decoded = decodeChannelModel(value);
    const channel = decoded ? config.channels.find((item) => item.id === decoded.channelId) : undefined;
    const provider = capability?.provider || channel?.name || t("settingsPanels.videoModelPicker.customProvider");
    const resolutions = capability && channel?.supertoken ? superTokenVideoResolutions(capability.family, channel.supertoken.videoModels) : [];
    const resolutionValues = resolutions.length ? resolutions : capability?.allowedResolutions || [];
    const resolution = capability?.fixedResolution || (capability?.family === "leonardo-minimax-h3" ? resolutionValues.map(superTokenVideoResolutionTierLabel).join(" / ") : resolutionValues.join(" / "));
    const duration = capability ? t("settingsPanels.videoModelPicker.maxSeconds", { count: capability.duration.max }) : "";

    return {
        value,
        modelLabel: capability?.label || model,
        provider,
        family,
        faceSupport: faceSupport(family, capability),
        summary: modelSummary(family, model, capability, t),
        detail: [resolution, duration].filter(Boolean).join(" · ") || modelOptionLabel(config, value),
        references: capability ? referenceStats(capability, t) : [],
        preview: capability?.family === "grok-imagine-video-1.5-preview",
    };
}

function modelFamily(model: string): FamilyId {
    const value = model.toLowerCase();
    if (value.includes("seedance")) return "seedance";
    if (value.includes("kling")) return "kling";
    if (value.includes("minimax") || value.includes("hailuo")) return "minimax";
    if (value.startsWith("grok-imagine-video")) return "grok";
    return "other";
}

function faceSupport(family: FamilyId, capability: SuperTokenVideoCapability | undefined): FaceSupport {
    if (!capability) return "unknown";
    if (capability.supportsHumanFaces !== undefined) return capability.supportsHumanFaces ? "supported" : "unsupported";
    if (family === "seedance") return capability.provider === "Leonardo" ? "supported" : "unsupported";
    if (family === "kling" || family === "minimax") return "supported";
    return "unknown";
}

function modelSummary(family: FamilyId, model: string, capability: SuperTokenVideoCapability | undefined, t: TFunction) {
    const value = model.toLowerCase();
    if (family === "seedance" && value.includes("2.5")) return t("settingsPanels.videoModelPicker.summaries.seedance25");
    if (family === "seedance" && value.includes("fast")) return t("settingsPanels.videoModelPicker.summaries.seedanceFast");
    if (family === "seedance" && value.includes("2.0")) return t("settingsPanels.videoModelPicker.summaries.seedance20");
    if (family === "kling" && value.includes("omni")) return t("settingsPanels.videoModelPicker.summaries.klingOmni");
    if (family === "kling") return t("settingsPanels.videoModelPicker.summaries.kling30");
    if (family === "minimax") return t("settingsPanels.videoModelPicker.summaries.minimaxH3");
    if (family === "grok" && value.includes("1.5-preview")) return t("settingsPanels.videoModelPicker.summaries.grokPreview");
    if (family === "grok") return t("settingsPanels.videoModelPicker.summaries.grokBase");
    return capability ? t("settingsPanels.videoModelPicker.maxSeconds", { count: capability.duration.max }) : t("settingsPanels.videoModelPicker.customSummary");
}

function referenceStats(capability: SuperTokenVideoCapability, t: TFunction): ReferenceStat[] {
    if (capability.family === "adobe-kling-3.0") return [{ kind: "frame", label: t("settingsPanels.videoModelPicker.startEndFrames") }];
    if (capability.family === "adobe-kling-3.0-omni") return [{ kind: "image", label: t("settingsPanels.videoModelPicker.images", { count: 3 }) }];

    const limits = Object.values(capability.referenceModes);
    const max = (key: "images" | "videos" | "audios") => Math.max(0, ...limits.map((limit) => limit?.[key] || 0));
    const stats: ReferenceStat[] = [];
    if (max("images")) stats.push({ kind: "image", label: t("settingsPanels.videoModelPicker.images", { count: max("images") }) });
    if (max("videos")) stats.push({ kind: "video", label: t("settingsPanels.videoModelPicker.videos", { count: max("videos") }) });
    if (max("audios")) stats.push({ kind: "audio", label: t("settingsPanels.videoModelPicker.audios", { count: max("audios") }) });
    return stats;
}

function availableFamilies(items: VideoOption[], faceMode: FaceMode) {
    return FAMILY_IDS.filter((family) => items.some((item) => item.family === family && (faceMode === "general" || item.faceSupport === "supported")));
}

function groupOptions(items: VideoOption[], family: FamilyId) {
    const groups = new Map<string, { label: string; summary: string; items: VideoOption[] }>();
    items.forEach((item) => {
        const group = groups.get(item.modelLabel) || { label: item.modelLabel, summary: item.summary, items: [] };
        group.items.push(item);
        groups.set(item.modelLabel, group);
    });
    return Array.from(groups.values())
        .map((group) => ({ ...group, items: group.items.sort((a, b) => providerOrder(a.provider) - providerOrder(b.provider)) }))
        .sort((a, b) => groupOrder(family, a.label) - groupOrder(family, b.label));
}

function groupOrder(family: FamilyId, label: string) {
    const value = label.toLowerCase();
    if (family === "seedance") {
        if (value.includes("2.5")) return 0;
        if (value.includes("fast")) return 1;
        if (value.includes("2.0")) return 2;
    }
    if (family === "kling") return value.includes("omni") ? 0 : 1;
    if (family === "grok") return value.includes("1.5") ? 1 : 0;
    return 10;
}

function providerOrder(provider: string) {
    if (provider === "Adobe") return 0;
    if (provider === "Leonardo") return 1;
    return 2;
}

function useMobilePicker() {
    const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches);
    useEffect(() => {
        const media = window.matchMedia("(max-width: 639px)");
        const update = () => setMobile(media.matches);
        update();
        media.addEventListener("change", update);
        return () => media.removeEventListener("change", update);
    }, []);
    return mobile;
}

function useCloseOnOtherPicker(pickerId: string, setOpen: (open: boolean) => void) {
    useEffect(() => {
        const closeOtherPicker = (event: Event) => {
            if ((event as CustomEvent<string>).detail !== pickerId) setOpen(false);
        };
        window.addEventListener("model-picker-open", closeOtherPicker);
        return () => window.removeEventListener("model-picker-open", closeOtherPicker);
    }, [pickerId, setOpen]);
}
