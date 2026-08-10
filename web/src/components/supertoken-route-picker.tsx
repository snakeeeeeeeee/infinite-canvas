import { useState, useSyncExternalStore } from "react";
import type { TFunction } from "i18next";
import { Check, ChevronDown, Globe2, LoaderCircle, RefreshCw, Zap } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { superTokenBaseUrl, type SuperTokenRegion } from "@/lib/supertoken-capabilities";
import {
    checkSuperTokenRouteHealth,
    getSuperTokenRouteHealth,
    subscribeSuperTokenRouteHealth,
    type SuperTokenRouteHealth,
} from "@/services/api/supertoken-route-health";
import { resolveModelChannel, useConfigStore, type AiConfig } from "@/stores/use-config-store";

type SuperTokenRoutePickerProps = {
    config: AiConfig;
    variant?: "compact" | "field";
    className?: string;
};

const ROUTES: SuperTokenRegion[] = ["cn", "global"];

export function canSelectSuperTokenRoute(config: AiConfig) {
    if (!config.model.trim()) return false;
    const channel = resolveModelChannel(config, config.model);
    return Boolean(channel.provider === "supertoken" && channel.supertoken?.resourceApiKey.trim() && superTokenBaseUrl("cn") !== superTokenBaseUrl("global"));
}

export function SuperTokenRoutePicker({ config, variant = "compact", className }: SuperTokenRoutePickerProps) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const globalRegion = useConfigStore((state) => state.config.supertokenRegion);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const channel = resolveModelChannel(config, config.model);
    const settings = channel.provider === "supertoken" ? channel.supertoken : undefined;
    const resourceApiKey = settings?.resourceApiKey || "";
    const defaultRegion = settings?.region || "cn";
    const activeRegion = globalRegion || defaultRegion;
    const cnHealth = useSyncExternalStore(subscribeSuperTokenRouteHealth, () => getSuperTokenRouteHealth("cn", resourceApiKey), () => undefined);
    const globalHealth = useSyncExternalStore(subscribeSuperTokenRouteHealth, () => getSuperTokenRouteHealth("global", resourceApiKey), () => undefined);
    const healthByRegion = { cn: cnHealth, global: globalHealth };
    const activeHealth = healthByRegion[activeRegion];
    const routesAreDistinct = superTokenBaseUrl("cn") !== superTokenBaseUrl("global");

    if (!canSelectSuperTokenRoute(config) || !settings || !routesAreDistinct) return null;

    const loadHealth = (force: boolean) => {
        void Promise.all(ROUTES.map((region) => checkSuperTokenRouteHealth(region, resourceApiKey, force)));
    };
    const changeOpen = (nextOpen: boolean) => {
        setOpen(nextOpen);
        if (nextOpen) loadHealth(false);
    };
    const changeRegion = (region?: SuperTokenRegion) => {
        updateConfig("supertokenRegion", region);
        setOpen(false);
    };

    return (
        <PopoverPrimitive.Root open={open} onOpenChange={changeOpen}>
            <PopoverPrimitive.Trigger asChild>
                <button
                    type="button"
                    className={cn(
                        variant === "field"
                            ? "flex h-8 w-full min-w-0 items-center gap-2 rounded-full border border-input bg-transparent px-3 text-sm font-normal shadow-sm transition-colors outline-none hover:bg-black/[0.025] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 dark:hover:bg-white/5"
                            : "inline-flex h-8 max-w-[72px] min-w-0 shrink-0 items-center gap-1 rounded-md bg-transparent px-1 text-xs text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10",
                        open && variant === "field" && "border-ring ring-2 ring-ring/20",
                        className,
                    )}
                    aria-label={t("canvas.routePicker.current", { route: routeName(t, activeRegion), status: healthText(t, activeHealth) })}
                >
                    <StatusDot health={activeHealth} />
                    <span className={cn("truncate", variant === "field" && "text-foreground")}>{routeName(t, activeRegion)}</span>
                    <ChevronDown className={cn("size-3 shrink-0 transition-transform", variant === "field" && "ml-auto", open && "rotate-180")} />
                </button>
            </PopoverPrimitive.Trigger>
            <PopoverPrimitive.Portal>
                <PopoverPrimitive.Content
                    data-canvas-no-zoom
                    side="bottom"
                    align="end"
                    sideOffset={7}
                    collisionPadding={12}
                    className="z-[1250] w-80 rounded-lg border border-border/70 bg-popover p-2 text-popover-foreground shadow-xl outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
                    onPointerDown={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                >
                    <div className="flex h-8 items-center justify-between px-2">
                        <span className="text-sm font-medium">{t("canvas.routePicker.title")}</span>
                        <button type="button" className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title={t("canvas.routePicker.refresh")} onClick={() => loadHealth(true)}>
                            <RefreshCw className={cn("size-3.5", ROUTES.some((region) => healthByRegion[region]?.status === "checking") && "animate-spin")} />
                        </button>
                    </div>
                    <div className="mt-1 space-y-1">
                        {ROUTES.map((region) => {
                            const health = healthByRegion[region];
                            const selected = region === activeRegion;
                            const Icon = region === "cn" ? Zap : Globe2;
                            return (
                                <button
                                    key={region}
                                    type="button"
                                    className={cn("flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent/70", selected && "bg-accent")}
                                    onClick={() => changeRegion(region)}
                                >
                                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-2 text-sm font-medium">
                                            {routeFullName(t, region)}
                                            {region === defaultRegion ? <span className="text-[11px] font-normal text-muted-foreground">{t("canvas.routePicker.default")}</span> : null}
                                        </span>
                                        <span className="block truncate text-[11px] text-muted-foreground">{superTokenBaseUrl(region).replace(/^https?:\/\//, "")}</span>
                                    </span>
                                    <span className={cn("shrink-0 text-xs", healthColor(health))}>{healthText(t, health)}</span>
                                    <span className="flex size-4 shrink-0 items-center justify-center">{selected ? <Check className="size-3.5" strokeWidth={2.5} /> : null}</span>
                                </button>
                            );
                        })}
                    </div>
                    <div className="mt-1 flex min-h-7 items-center justify-between border-t border-border/60 px-2 pt-1 text-[11px] text-muted-foreground">
                        <span>{ROUTES.some((region) => healthByRegion[region]?.checkedAt) ? t("canvas.routePicker.checkedRecently") : t("canvas.routePicker.onDemand")}</span>
                        {globalRegion ? <button type="button" className="rounded px-1.5 py-1 transition-colors hover:bg-accent hover:text-foreground" onClick={() => changeRegion(undefined)}>{t("canvas.routePicker.followDefault")}</button> : null}
                    </div>
                </PopoverPrimitive.Content>
            </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
    );
}

function StatusDot({ health }: { health?: SuperTokenRouteHealth }) {
    if (health?.status === "checking") return <LoaderCircle className="size-3 shrink-0 animate-spin" />;
    const color = !health ? "bg-muted-foreground/45" : health.status === "healthy" ? "bg-emerald-500" : health.status === "slow" ? "bg-amber-500" : "bg-red-500";
    const active = health?.status === "healthy" || health?.status === "slow";
    return (
        <span className="relative flex size-2 shrink-0 items-center justify-center">
            {active ? <span className={cn("absolute inset-0 rounded-full opacity-40 motion-safe:animate-ping motion-safe:[animation-duration:2.8s]", color)} /> : null}
            <span className={cn("relative size-1.5 rounded-full", color)} />
        </span>
    );
}

function routeName(t: TFunction, region: SuperTokenRegion) {
    return t(region === "cn" ? "canvas.routePicker.cnShort" : "canvas.routePicker.globalShort");
}

function routeFullName(t: TFunction, region: SuperTokenRegion) {
    return t(region === "cn" ? "canvas.routePicker.cn" : "canvas.routePicker.global");
}

function healthText(t: TFunction, health?: SuperTokenRouteHealth) {
    if (!health) return t("canvas.routePicker.unchecked");
    if (health.status === "checking") return t("canvas.routePicker.checking");
    if (health.status === "unavailable") return t(health.reason === "unauthorized" ? "canvas.routePicker.unauthorized" : health.reason === "timeout" ? "canvas.routePicker.timeout" : "canvas.routePicker.unavailable");
    return `${t(health.status === "slow" ? "canvas.routePicker.slow" : "canvas.routePicker.healthy")} · ${health.latencyMs}ms`;
}

function healthColor(health?: SuperTokenRouteHealth) {
    if (!health || health.status === "checking") return "text-muted-foreground";
    if (health.status === "healthy") return "text-emerald-600 dark:text-emerald-400";
    if (health.status === "slow") return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
}
