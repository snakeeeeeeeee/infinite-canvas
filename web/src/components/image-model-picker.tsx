import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { Check, ChevronDown, Image as ImageIcon, Settings2, Sparkles } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { superTokenImageCapability, type SuperTokenImageFamily } from "@/lib/supertoken-capabilities";
import { decodeChannelModel, modelOptionLabel, modelOptionName, selectableModelsByCapability, type AiConfig } from "@/stores/use-config-store";

type ImageModelPickerProps = {
    config: AiConfig;
    value?: string;
    onChange: (model: string) => void;
    className?: string;
    fullWidth?: boolean;
    compact?: boolean;
    placeholder?: string;
    onMissingConfig?: () => void;
};

type FamilyId = SuperTokenImageFamily | "other";

type ImageOption = {
    value: string;
    family: FamilyId;
    order: number;
    recommended: boolean;
    title: string;
    alias: string;
    detail: string;
    capability: string;
    triggerLabel: string;
};

const FAMILY_IDS: FamilyId[] = ["gpt-image", "gemini", "grok", "other"];

export function ImageModelPicker({ config, value, onChange, className, fullWidth = false, compact = false, placeholder, onMissingConfig }: ImageModelPickerProps) {
    const { t } = useTranslation();
    const pickerId = useId();
    const [open, setOpen] = useState(false);
    const [family, setFamily] = useState<FamilyId>("gpt-image");
    const lastSelectionByFamily = useRef<Partial<Record<FamilyId, string>>>({});
    const options = useMemo(() => selectableModelsByCapability(config, "image"), [config]);
    const items = useMemo(() => options.map((option) => buildImageOption(config, option, t)), [config, options, t]);
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
            if (selected) setFamily(selected.family);
        }
        setOpen(nextOpen);
    };

    useCloseOnOtherPicker(pickerId, setOpen);

    useEffect(() => {
        if (selected) lastSelectionByFamily.current[selected.family] = selected.value;
    }, [selected]);

    const changeFamily = (nextFamily: FamilyId) => {
        setFamily(nextFamily);
        const candidates = items.filter((item) => item.family === nextFamily).sort((a, b) => Number(b.recommended) - Number(a.recommended) || a.order - b.order);
        const remembered = candidates.find((item) => item.value === lastSelectionByFamily.current[nextFamily]);
        const next = remembered || candidates[0];
        if (!next || next.value === current) return;
        lastSelectionByFamily.current[nextFamily] = next.value;
        onChange(next.value);
    };

    return (
        <PopoverPrimitive.Root open={open} onOpenChange={changeOpen}>
            <PopoverPrimitive.Trigger asChild>
                <button
                    type="button"
                    className={cn(
                        "canvas-composer-model-picker flex h-8 max-w-full items-center gap-2 rounded-full border border-input bg-transparent px-3 text-sm font-normal shadow-sm transition-colors outline-none",
                        fullWidth ? "w-full min-w-0 justify-start" : "w-fit min-w-[9rem] justify-start",
                        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20",
                        open && "border-ring ring-2 ring-ring/20",
                        className,
                    )}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    title={selected?.triggerLabel || pickerPlaceholder}
                >
                    {selected ? <FamilyIcon family={selected.family} /> : <Settings2 className="size-4 shrink-0 opacity-70" />}
                    <span className="canvas-model-picker-text min-w-0 flex-1 truncate text-left">{selected?.triggerLabel || pickerPlaceholder}</span>
                    <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
                </button>
            </PopoverPrimitive.Trigger>
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
                    <ImagePickerPanel
                        items={items}
                        selectedValue={current}
                        family={family}
                        compact={compact}
                        onFamilyChange={changeFamily}
                        onSelect={(nextValue) => {
                            const next = items.find((item) => item.value === nextValue);
                            if (next) lastSelectionByFamily.current[next.family] = nextValue;
                            onChange(nextValue);
                            setOpen(false);
                        }}
                    />
                </PopoverPrimitive.Content>
            </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
    );
}

function ImagePickerPanel({ items, selectedValue, family, compact, onFamilyChange, onSelect }: {
    items: ImageOption[];
    selectedValue: string;
    family: FamilyId;
    compact: boolean;
    onFamilyChange: (family: FamilyId) => void;
    onSelect: (value: string) => void;
}) {
    const { t } = useTranslation();
    const families = FAMILY_IDS.filter((familyId) => items.some((item) => item.family === familyId));
    const activeFamily = families.includes(family) ? family : families[0] || "other";
    const visibleItems = items.filter((item) => item.family === activeFamily).sort((a, b) => a.order - b.order);

    return (
        <section className={cn("flex min-h-0 flex-col overflow-hidden", compact ? "max-h-[min(420px,var(--radix-popover-content-available-height))]" : "max-h-[min(540px,var(--radix-popover-content-available-height))]")}>
            <div className={cn("flex shrink-0 gap-1 overflow-x-auto border-b border-border/70", compact ? "px-2 py-1.5" : "px-3 py-2 sm:px-4")}>
                {families.map((familyId) => (
                    <button
                        key={familyId}
                        type="button"
                        onClick={() => onFamilyChange(familyId)}
                        className={cn(
                            "flex flex-1 items-center justify-center rounded-md transition-colors",
                            compact ? "min-w-[120px] gap-2 px-2 py-1.5 text-[13px]" : "min-w-[150px] gap-2.5 px-3 py-2 text-sm",
                            activeFamily === familyId ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                        )}
                    >
                        <FamilyIcon family={familyId} />
                        <span className="whitespace-nowrap font-medium">{t(`settingsPanels.imageModelPicker.families.${familyId}`)}</span>
                    </button>
                ))}
            </div>

            <div className={cn("min-h-0 flex-1 overflow-y-auto", compact ? "px-2 py-2" : "px-3 py-3 sm:px-4")}>
                {visibleItems.length ? (
                    <div className={cn("grid sm:grid-cols-2", compact ? "gap-1.5" : "gap-2")}>
                        {visibleItems.map((item) => (
                            <ImageOptionCard key={item.value} item={item} selected={item.value === selectedValue} compact={compact} onSelect={onSelect} />
                        ))}
                    </div>
                ) : (
                    <div className="flex min-h-40 items-center justify-center px-6 text-center text-sm text-muted-foreground">{t("settingsPanels.imageModelPicker.empty")}</div>
                )}
            </div>
        </section>
    );
}

function ImageOptionCard({ item, selected, compact, onSelect }: { item: ImageOption; selected: boolean; compact: boolean; onSelect: (value: string) => void }) {
    const { t } = useTranslation();
    return (
        <button
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(item.value)}
            className={cn(
                "group flex w-full items-start rounded-lg border text-left transition-colors",
                compact ? "min-h-[74px] gap-2 px-2.5 py-2" : "min-h-[88px] gap-3 px-3 py-2.5",
                selected ? "border-foreground bg-accent" : "border-border/80 hover:border-foreground/35 hover:bg-accent/60",
            )}
        >
            <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={cn("break-words font-medium", compact ? "text-[13px]" : "text-sm")}>{item.title}</span>
                    {item.alias ? <span className={cn("text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>{item.alias}</span> : null}
                    {item.recommended ? <span className={cn("inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400", compact ? "text-[11px]" : "text-xs")}><Sparkles className="size-3" />{t("settingsPanels.imageModelPicker.recommended")}</span> : null}
                </span>
                <span className={cn("mt-1.5 block text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>{item.detail}</span>
                <span className={cn("mt-1 block font-medium text-foreground/75", compact ? "text-[11px]" : "text-xs")}>{item.capability}</span>
            </span>
            <span className={cn("mt-1 flex shrink-0 items-center justify-center rounded-full border", compact ? "size-[18px]" : "size-5", selected ? "border-foreground bg-foreground text-background" : "border-muted-foreground/55")}>
                {selected ? <Check className={compact ? "size-3" : "size-3.5"} strokeWidth={3} /> : null}
            </span>
        </button>
    );
}

function buildImageOption(config: AiConfig, value: string, t: TFunction): ImageOption {
    const model = modelOptionName(value);
    const decoded = decodeChannelModel(value);
    const channel = decoded ? config.channels.find((item) => item.id === decoded.channelId) : undefined;
    const capability = channel?.provider === "supertoken" ? superTokenImageCapability(model) : undefined;

    if (!capability) {
        return {
            value,
            family: "other",
            order: 0,
            recommended: false,
            title: model,
            alias: channel?.name || t("settingsPanels.imageModelPicker.customProvider"),
            detail: modelOptionLabel(config, value),
            capability: t("settingsPanels.imageModelPicker.customModel"),
            triggerLabel: modelOptionLabel(config, value),
        };
    }

    const alias = capability.alias ? t(`settingsPanels.imageModelPicker.aliases.${capability.alias}`) : "";
    const provider = t(`settingsPanels.imageModelPicker.providers.${capability.provider}`);
    const positioning = capability.positioning ? t(`settingsPanels.imageModelPicker.positioning.${capability.positioning}`) : "";
    const resolution = capability.displayResolution.min
        ? t("settingsPanels.imageModelPicker.resolutionRange", { min: capability.displayResolution.min, max: capability.displayResolution.max })
        : t("settingsPanels.imageModelPicker.maxResolution", { max: capability.displayResolution.max });
    const outputs = capability.maxOutputsPerRequest > 1
        ? t("settingsPanels.imageModelPicker.maxOutputs", { count: capability.maxOutputsPerRequest })
        : t("settingsPanels.imageModelPicker.singleOutput");
    const triggerLabel = capability.family === "gpt-image" ? `${capability.label} · ${provider}` : alias ? `${alias} · ${capability.label.replace(/ Image$/, "")}` : `${capability.label} · ${provider}`;

    return {
        value,
        family: capability.family,
        order: capability.family === "gpt-image" ? providerOrder(capability.provider) : capability.positioning === "fast" ? 0 : 1,
        recommended: capability.provider === "adobe" || capability.alias === "small-banana",
        title: capability.family === "gpt-image" ? provider : capability.label,
        alias,
        detail: [positioning, resolution, outputs].filter(Boolean).join(" · "),
        capability: t("settingsPanels.imageModelPicker.generateAndEdit"),
        triggerLabel,
    };
}

function providerOrder(provider: "azure" | "adobe" | "third-party" | "google" | "xAI") {
    if (provider === "adobe") return 0;
    if (provider === "azure") return 1;
    if (provider === "third-party") return 2;
    return 3;
}

function FamilyIcon({ family }: { family: FamilyId }) {
    if (family === "gpt-image") return <img src="/icons/openai.svg" alt="" className="size-4 shrink-0 dark:invert" />;
    if (family === "gemini") return <img src="/icons/gemini.svg" alt="" className="size-4 shrink-0" />;
    if (family === "grok") return <img src="/icons/grok.svg" alt="" className="size-4 shrink-0 dark:invert" />;
    return <ImageIcon className="size-4 shrink-0 opacity-70" />;
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
