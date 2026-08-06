import { App, Button, Drawer, Input, Segmented, Select, Space, Tag } from "antd";
import { Image, KeyRound, ListPlus, RefreshCw, Trash2, Video } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { superTokenBaseUrl, superTokenUnsupportedModels } from "@/lib/supertoken-capabilities";
import { fetchSuperTokenModels, testSuperTokenResourceKey } from "@/services/api/supertoken";
import { createModelChannel, createSuperTokenChannel, defaultBaseUrlForApiFormat, guessCapability, normalizeChannelModels, type ApiCallFormat, type ChannelModel, type ModelCapability, type ModelChannel, type SuperTokenChannelConfig } from "@/stores/use-config-store";
import { ModelScriptEditor } from "./model-script-editor";
import { ModelSelectModal } from "./model-select-modal";

type ScriptTarget = { name: string; capability: ModelCapability; value: string };

export function ChannelEditorDrawer({ open, channel, onSave, onClose }: { open: boolean; channel: ModelChannel | null; onSave: (channel: ModelChannel) => void; onClose: () => void }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const [draft, setDraft] = useState<ModelChannel | null>(channel);
    const [selectOpen, setSelectOpen] = useState(false);
    const [scriptTarget, setScriptTarget] = useState<ScriptTarget | null>(null);
    const [checking, setChecking] = useState<"image" | "video" | "resource" | "all" | "">("");
    const apiFormatOptions: Array<{ label: string; value: ApiCallFormat }> = [
        { label: "OpenAI", value: "openai" },
        { label: "Gemini", value: "gemini" },
        { label: t("config.protocols.ark"), value: "ark" },
    ];
    const capabilityOptions: Array<{ label: string; value: ModelCapability }> = ["image", "video", "text", "audio"].map((value) => ({ label: t(`config.channelEditor.capabilities.${value}`), value: value as ModelCapability }));

    useEffect(() => {
        if (open && channel) setDraft(channel);
    }, [open, channel]);

    if (!draft) return null;

    const patch = (value: Partial<ModelChannel>) => setDraft((current) => (current ? { ...current, ...value } : current));
    const isSuperToken = draft.provider === "supertoken";
    const resourceKeyMissing = isSuperToken && !draft.supertoken?.resourceApiKey.trim();
    const setModels = (models: ChannelModel[]) => patch({ models });

    const changeApiFormat = (apiFormat: ApiCallFormat) => {
        const baseUrl = !draft.baseUrl.trim() || draft.baseUrl.trim() === defaultBaseUrlForApiFormat(draft.apiFormat) ? defaultBaseUrlForApiFormat(apiFormat) : draft.baseUrl;
        patch({ apiFormat, baseUrl });
    };

    const applySelection = (names: string[]) => {
        const map = new Map(draft.models.map((model) => [model.name, model]));
        setModels(names.map((name) => map.get(name) || { name, capability: guessCapability(name) }));
    };

    const setCapability = (name: string, capability: ModelCapability) => setModels(draft.models.map((model) => (model.name === name ? { ...model, capability } : model)));
    const setScript = (name: string, script: string) => setModels(draft.models.map((model) => (model.name === name ? { ...model, script: script || undefined } : model)));
    const removeModel = (name: string) => setModels(draft.models.filter((model) => model.name !== name));

    const changeProvider = (provider: "custom" | "supertoken") => {
        const base = { id: draft.id, name: draft.name };
        setDraft(provider === "supertoken" ? createSuperTokenChannel(base) : createModelChannel(base));
    };

    const patchSuperToken = (value: Partial<SuperTokenChannelConfig>) => {
        const next = createSuperTokenChannel({ ...draft, supertoken: { ...draft.supertoken!, ...value } });
        setDraft(next);
    };

    const loadSuperTokenModels = async (kind: "image" | "video") => {
        const settings = draft.supertoken!;
        const key = kind === "image" ? settings.imageApiKey : settings.videoApiKey;
        if (!key.trim()) throw new Error(t(kind === "image" ? "config.superToken.imageKeyRequired" : "config.superToken.videoKeyRequired"));
        const models = await fetchSuperTokenModels(superTokenBaseUrl(settings.region), key);
        patchSuperToken(kind === "image" ? { imageModels: models, syncedAt: Date.now() } : { videoModels: models, syncedAt: Date.now() });
        return models;
    };

    const testModels = async (kind: "image" | "video") => {
        setChecking(kind);
        try {
            const models = await loadSuperTokenModels(kind);
            message.success(t("config.superToken.modelsLoaded", { count: models.length }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("config.superToken.testFailed"));
        } finally {
            setChecking("");
        }
    };

    const testResource = async () => {
        setChecking("resource");
        try {
            const settings = draft.supertoken!;
            await testSuperTokenResourceKey(superTokenBaseUrl(settings.region), settings.resourceApiKey);
            message.success(t("config.superToken.resourceReady"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("config.superToken.testFailed"));
        } finally {
            setChecking("");
        }
    };

    const refreshAll = async () => {
        setChecking("all");
        try {
            const settings = draft.supertoken!;
            const imageKey = settings.imageApiKey.trim();
            const videoKey = settings.videoApiKey.trim();
            if (!imageKey && !videoKey) throw new Error(t("config.superToken.refreshKeyRequired"));
            const baseUrl = superTokenBaseUrl(settings.region);
            const [imageModels, videoModels] = await Promise.all([
                imageKey ? fetchSuperTokenModels(baseUrl, imageKey) : Promise.resolve(settings.imageModels),
                videoKey ? fetchSuperTokenModels(baseUrl, videoKey) : Promise.resolve(settings.videoModels),
            ]);
            patchSuperToken({ imageModels, videoModels, syncedAt: Date.now() });
            message.success(t("config.superToken.availableModelsLoaded", { images: imageModels.length, videos: videoModels.length }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("config.superToken.testFailed"));
        } finally {
            setChecking("");
        }
    };

    const save = () => {
        if (resourceKeyMissing) {
            message.error(t("config.superToken.resourceKeyRequired"));
            return;
        }
        onSave(isSuperToken ? createSuperTokenChannel({ ...draft, name: draft.name.trim() || "SuperToken" }) : { ...draft, name: draft.name.trim() || t("config.channels.unnamed"), models: normalizeChannelModels(draft.models) });
        onClose();
    };

    return (
        <Drawer
            open={open}
            width={640}
            title={t("config.channelEditor.title")}
            onClose={onClose}
            styles={{ body: { paddingTop: 16 } }}
            extra={
                <Space>
                    <Button onClick={onClose}>{t("common.cancel")}</Button>
                    <Button type="primary" disabled={resourceKeyMissing} onClick={save}>
                        {t("common.save")}
                    </Button>
                </Space>
            }
        >
            <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                    <span className="mb-1 block text-sm font-medium">{t("config.channelEditor.name")}</span>
                    <Input value={draft.name} onChange={(event) => patch({ name: event.target.value })} />
                </label>
                <label className="block">
                    <span className="mb-1 block text-sm font-medium">{t("config.channelEditor.provider")}</span>
                    <Segmented block value={isSuperToken ? "supertoken" : "custom"} options={[{ label: "SuperToken", value: "supertoken" }, { label: t("config.channelEditor.custom"), value: "custom" }]} onChange={(value) => changeProvider(value as "custom" | "supertoken")} />
                </label>
            </div>

            {isSuperToken ? (
                <SuperTokenEditor
                    draft={draft}
                    checking={checking}
                    onPatch={patchSuperToken}
                    onTestModels={testModels}
                    onTestResource={testResource}
                    onRefreshAll={refreshAll}
                />
            ) : (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="block">
                    <span className="mb-1 block text-sm font-medium">{t("config.channelEditor.protocol")}</span>
                    <Select className="w-full" value={draft.apiFormat} options={apiFormatOptions} onChange={changeApiFormat} />
                </label>
                <label className="block md:col-span-2">
                    <span className="mb-1 block text-sm font-medium">{t("config.channelEditor.baseUrl")}</span>
                    <Input value={draft.baseUrl} onChange={(event) => patch({ baseUrl: event.target.value })} placeholder="https://api.example.com" />
                </label>
                <label className="block md:col-span-2">
                    <span className="mb-1 block text-sm font-medium">API Key</span>
                    <Input.Password value={draft.apiKey} onChange={(event) => patch({ apiKey: event.target.value })} placeholder="sk-..." />
                </label>
                </div>
            )}

            {!isSuperToken ? <><div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div className="text-sm font-semibold">{t("config.channelEditor.models")}</div>
                    <div className="mt-0.5 text-xs text-stone-500">{t("config.channelEditor.modelDescription", { count: draft.models.length })}</div>
                </div>
                <Button type="primary" icon={<ListPlus className="size-4" />} onClick={() => setSelectOpen(true)}>
                    {t("config.channelEditor.selectModels")}
                </Button>
            </div>

            <div className="space-y-2 rounded-lg border border-stone-200 p-2 dark:border-stone-800">
                {draft.models.length ? (
                    draft.models.map((model) => (
                        <div key={model.name} className="flex flex-wrap items-center gap-3 rounded-md px-2 py-1.5 hover:bg-stone-50 dark:hover:bg-stone-900/40">
                            <span className="min-w-0 flex-1 truncate text-sm" title={model.name}>
                                {model.name}
                            </span>
                            <div className="flex shrink-0 items-center gap-2">
                                <Segmented size="small" value={model.capability} options={capabilityOptions} onChange={(value) => setCapability(model.name, value as ModelCapability)} />
                                <Button size="small" type={model.script ? "primary" : "default"} ghost={Boolean(model.script)} onClick={() => setScriptTarget({ name: model.name, capability: model.capability, value: model.script || "" })}>
                                    {t(model.script ? "config.channelEditor.scriptReady" : "config.channelEditor.script")}
                                </Button>
                                <Button size="small" danger type="text" icon={<Trash2 className="size-3.5" />} onClick={() => removeModel(model.name)} />
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="px-2 py-8 text-center text-sm text-stone-500">{t("config.channelEditor.empty")}</div>
                )}
            </div>
            </> : null}

            {!isSuperToken ? <ModelSelectModal open={selectOpen} channel={draft} selectedNames={draft.models.map((model) => model.name)} onConfirm={applySelection} onClose={() => setSelectOpen(false)} /> : null}

            <ModelScriptEditor
                open={Boolean(scriptTarget)}
                capability={scriptTarget?.capability || "text"}
                modelName={scriptTarget?.name || ""}
                value={scriptTarget?.value || ""}
                onSave={(script) => scriptTarget && setScript(scriptTarget.name, script)}
                onClose={() => setScriptTarget(null)}
            />
        </Drawer>
    );
}

function SuperTokenEditor({
    draft,
    checking,
    onPatch,
    onTestModels,
    onTestResource,
    onRefreshAll,
}: {
    draft: ModelChannel;
    checking: "image" | "video" | "resource" | "all" | "";
    onPatch: (value: Partial<SuperTokenChannelConfig>) => void;
    onTestModels: (kind: "image" | "video") => void;
    onTestResource: () => void;
    onRefreshAll: () => void;
}) {
    const { t } = useTranslation();
    const settings = draft.supertoken!;
    const unsupported = superTokenUnsupportedModels(settings.imageModels, settings.videoModels);
    const changeRegion = (region: SuperTokenChannelConfig["region"]) => onPatch({ region, imageModels: [], videoModels: [], syncedAt: undefined });
    return (
        <div className="mt-5 space-y-5">
            <div>
                <div className="mb-2 text-sm font-medium">{t("config.superToken.region")}</div>
                <Segmented
                    block
                    value={settings.region}
                    options={[
                        { label: t("config.superToken.cn"), value: "cn" },
                        { label: t("config.superToken.global"), value: "global" },
                    ]}
                    onChange={(value) => changeRegion(value as SuperTokenChannelConfig["region"])}
                />
                <div className="mt-1.5 text-xs text-stone-500">{superTokenBaseUrl(settings.region)}</div>
            </div>
            <KeyField
                icon={<Image className="size-4" />}
                label={t("config.superToken.imageKey")}
                value={settings.imageApiKey}
                placeholder="sk-..."
                loading={checking === "image"}
                onChange={(imageApiKey) => onPatch({ imageApiKey, imageModels: [], syncedAt: undefined })}
                onTest={() => onTestModels("image")}
            />
            <KeyField
                icon={<Video className="size-4" />}
                label={t("config.superToken.videoKey")}
                value={settings.videoApiKey}
                placeholder="sk-..."
                loading={checking === "video"}
                onChange={(videoApiKey) => onPatch({ videoApiKey, videoModels: [], syncedAt: undefined })}
                onTest={() => onTestModels("video")}
            />
            <KeyField
                icon={<KeyRound className="size-4" />}
                label={t("config.superToken.resourceKey")}
                value={settings.resourceApiKey}
                placeholder="ak_..."
                loading={checking === "resource"}
                required
                error={t("config.superToken.resourceKeyRequired")}
                onChange={(resourceApiKey) => onPatch({ resourceApiKey })}
                onTest={onTestResource}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-4 dark:border-stone-800">
                <div className="flex flex-wrap gap-2">
                    <Tag className="m-0">{t("config.superToken.imageModels", { count: settings.imageModels.length })}</Tag>
                    <Tag className="m-0">{t("config.superToken.videoModels", { count: settings.videoModels.length })}</Tag>
                    {unsupported.length ? <Tag className="m-0" color="warning">{t("config.superToken.unsupported", { count: unsupported.length })}</Tag> : null}
                </div>
                <Button icon={<RefreshCw className="size-4" />} loading={checking === "all"} onClick={onRefreshAll}>
                    {t("config.superToken.refreshAll")}
                </Button>
            </div>
            {unsupported.length ? (
                <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                    {t("config.superToken.unsupportedHint")}：{unsupported.join("、")}
                </div>
            ) : null}
        </div>
    );
}

function KeyField({ icon, label, value, placeholder, loading, required = false, error, onChange, onTest }: { icon: ReactNode; label: string; value: string; placeholder: string; loading: boolean; required?: boolean; error?: string; onChange: (value: string) => void; onTest: () => void }) {
    const { t } = useTranslation();
    const invalid = required && !value.trim();
    return (
        <label className="block">
            <span className="mb-1.5 flex items-center gap-2 text-sm font-medium">
                {icon}
                <span>{label}{required ? <span className="text-red-500 dark:text-red-400" aria-hidden="true"> *</span> : null}</span>
            </span>
            <div className="flex gap-2">
                <Input.Password value={value} status={invalid ? "error" : undefined} aria-required={required} aria-invalid={invalid} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
                <Button loading={loading} onClick={onTest}>{t("config.superToken.verify")}</Button>
            </div>
            {invalid && error ? <span className="mt-1.5 block text-xs text-red-500 dark:text-red-400">{error}</span> : null}
        </label>
    );
}
