import axios from "axios";
import localforage from "localforage";
import { nanoid } from "nanoid";

import { dataUrlToFile } from "@/lib/image-utils";
import {
    normalizeSuperTokenVideoSettings,
    resolveSuperTokenVideoModel,
    superTokenImageCapability,
    superTokenReferenceImageFields,
    superTokenVideoCapability,
    superTokenVideoResolutions,
    validateSuperTokenVideoSelection,
    type SuperTokenReferenceMode,
} from "@/lib/supertoken-capabilities";
import { getMediaBlob, uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { getImageBlob, imageToDataUrl, uploadImage, type UploadedImage } from "@/services/image-storage";
import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

type SuperTokenRequestConfig = AiConfig & {
    provider: "supertoken";
    channelId: string;
    resourceApiKey: string;
    availableImageModels: string[];
    availableVideoModels: string[];
};

type TaskError = { code?: string; message?: string; retryable?: boolean } | null;
type TaskResultImage = { url: string; mime_type?: string; width?: number; height?: number; size_bytes?: number; filename?: string; url_auth?: "none" | "resource_api_key" };
type TaskResultVideo = { url: string; mime_type?: string; width?: number; height?: number; duration_ms?: number; filename?: string; url_auth?: "none" | "resource_api_key" };
type TaskResponse<T> = {
    id: string;
    status: "queued" | "in_progress" | "succeeded" | "failed";
    progress?: number;
    progress_known?: boolean;
    result?: T | null;
    error?: TaskError;
};

export type SuperTokenTaskKind = "image" | "video";
export type SuperTokenTaskRecord = {
    id: string;
    kind: SuperTokenTaskKind;
    channelId: string;
    baseUrl: string;
    model: string;
    selectedModel: string;
    idempotencyKey: string;
    clientReferenceId: string;
    status: "pending" | "succeeded" | "failed";
    progress: number;
    progressKnown: boolean;
    retryAfterMs: number;
    createdAt: number;
    updatedAt: number;
    error?: string;
    resultUrls?: string[];
    resultStorageKeys?: string[];
    request?: Record<string, unknown>;
    context?: Record<string, string | number | boolean>;
};

export type SuperTokenGeneratedImage = { id: string; dataUrl: string; storageKey: string; width: number; height: number; bytes: number; mimeType: string };

type RequestOptions = {
    signal?: AbortSignal;
    pollSignal?: AbortSignal;
    idempotencyKey?: string;
    clientReferenceId?: string;
    context?: SuperTokenTaskRecord["context"];
    onTaskCreated?: (task: SuperTokenTaskRecord) => void | Promise<void>;
    onProgress?: (task: SuperTokenTaskRecord) => void;
};

type ImageRequest = {
    prompt: string;
    references: ReferenceImage[];
    mask?: ReferenceImage;
    size?: string;
    quality?: string;
    resolution?: string;
    background?: string;
    count?: number;
};

export type MediaUploadInput = { clientId: string; kind: "image" | "video" | "audio"; name: string; type: string; blob: Blob };
type MediaUploadSession = { id: string; client_id?: string; kind: string; method: string; upload_url: string; headers?: Record<string, string> };
type MediaUploadResult = { id: string; client_id?: string; kind: string; url: string; mime_type?: string };

const taskStore = localforage.createInstance({ name: "infinite-canvas", storeName: "supertoken_async_tasks" });
const DEFAULT_RETRY_MS = 2000;

export async function fetchSuperTokenModels(baseUrl: string, apiKey: string, signal?: AbortSignal) {
    if (!apiKey.trim()) throw new Error("请先填写对应的 Model API Key");
    const response = await axios.get<{ data?: Array<{ id?: string }> }>(apiUrl(baseUrl, "/models"), {
        headers: authHeaders(apiKey),
        signal,
    });
    return (response.data.data || [])
        .map((item) => item.id?.trim())
        .filter((item): item is string => Boolean(item))
        .sort((a, b) => a.localeCompare(b));
}

export async function testSuperTokenResourceKey(baseUrl: string, resourceApiKey: string, signal?: AbortSignal) {
    if (!resourceApiKey.trim()) throw new Error("请先填写 Resource API Key");
    await axios.get(apiUrl(baseUrl, "/image/tasks?limit=1"), { headers: authHeaders(resourceApiKey), signal });
}

export async function requestSuperTokenImages(config: SuperTokenRequestConfig, request: ImageRequest, options: RequestOptions = {}) {
    const capability = superTokenImageCapability(config.model);
    if (!capability) throw new Error("当前模型尚未接入 SuperToken 异步图片协议");
    if (request.mask && !capability.mask) throw new Error("当前模型不支持蒙版编辑");
    if (config.model.startsWith("gemini-") && request.background === "transparent") throw new Error("当前模型不支持透明背景");
    if (request.references.length > capability.maxImages) throw new Error(`当前模型最多支持 ${capability.maxImages} 张参考图`);
    const count = Math.max(1, Math.floor(request.count || 1));
    if (count > capability.maxOutputsPerRequest) throw new Error(`当前模型单次最多生成 ${capability.maxOutputsPerRequest} 张图片`);
    if (request.quality && !capability.qualities.includes(request.quality)) throw new Error("当前模型不支持所选图片质量");
    if (capability.aspectRatios && request.size && !capability.aspectRatios.includes(request.size)) throw new Error("当前模型不支持所选图片比例");
    if (capability.resolutions && request.resolution && !capability.resolutions.includes(request.resolution)) throw new Error("当前模型不支持所选图片分辨率");
    const operation = request.references.length ? "edit" : "generation";
    if (!capability.operations.includes(operation)) throw new Error("当前模型不支持此图片操作");

    const idempotencyKey = options.idempotencyKey || `canvas-image-${nanoid()}`;
    const clientReferenceId = options.clientReferenceId || idempotencyKey;
    const output = buildSuperTokenImageOutput(config.model, request);
    const requestSnapshot = {
        operation,
        input: {
            prompt: request.prompt,
            references: request.references.map(referenceSnapshot),
            ...(request.mask ? { mask: referenceSnapshot(request.mask) } : {}),
        },
        output,
    };
    let response;
    if (operation === "edit" && !canUseImageUrls(request.references, request.mask)) {
        const form = new FormData();
        form.set("model", config.model);
        form.set("operation", operation);
        form.set("prompt", request.prompt);
        form.set("n", "1");
        form.set("client_reference_id", clientReferenceId);
        appendImageOutput(form, output);
        const files = await Promise.all(request.references.map(referenceImageFile));
        files.forEach((file) => form.append("image", file));
        if (request.mask) form.set("mask", await referenceImageFile(request.mask));
        response = await axios.post<TaskResponse<{ images: TaskResultImage[] }>>(apiUrl(config.baseUrl, "/image/tasks"), form, {
            headers: { ...authHeaders(config.apiKey), "Idempotency-Key": idempotencyKey },
            signal: options.signal,
        });
    } else {
        const input = {
            prompt: request.prompt,
            ...(request.references.length ? { images: request.references.map((item) => ({ url: item.url })) } : {}),
            ...(request.mask?.url ? { mask: { url: request.mask.url } } : {}),
        };
        response = await axios.post<TaskResponse<{ images: TaskResultImage[] }>>(
            apiUrl(config.baseUrl, "/image/tasks"),
            { model: config.model, operation, input, output, client_reference_id: clientReferenceId },
            { headers: { ...authHeaders(config.apiKey), "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, signal: options.signal },
        );
    }
    const task = await persistCreatedTask("image", config, config.model, response.data, idempotencyKey, clientReferenceId, response.headers["retry-after"], options, config.model, requestSnapshot);
    return resumeSuperTokenImageTask(config, task, options.pollSignal ? { ...options, signal: options.pollSignal } : options);
}

export async function resumeSuperTokenImageTask(config: SuperTokenRequestConfig, task: SuperTokenTaskRecord, options: RequestOptions = {}): Promise<SuperTokenGeneratedImage[]> {
    const restored = await restoreMaterializedImages(task);
    if (restored) return restored;
    const completed = await waitForTask<{ images: TaskResultImage[] }>(task, config.resourceApiKey, options);
    const images = completed.result?.images || [];
    if (!images.length) {
        await failStoredTask(task, "图片任务成功但没有返回结果");
        throw new Error("图片任务成功但没有返回结果");
    }
    for (;;) {
        try {
            return await materializeImageResults(task, images, config.resourceApiKey, options.signal);
        } catch (error) {
            if (isAbort(error)) throw new DOMException("Aborted", "AbortError");
            if (axios.isAxiosError(error) && isTransientStatus(error.response?.status)) {
                await delay(task.retryAfterMs || DEFAULT_RETRY_MS, options.signal);
                continue;
            }
            throw error;
        }
    }
}

export async function createSuperTokenVideoTask(
    config: SuperTokenRequestConfig,
    selectedModel: string,
    prompt: string,
    references: ReferenceImage[],
    videoReferences: ReferenceVideo[],
    audioReferences: ReferenceAudio[],
    options: RequestOptions = {},
) {
    const capability = superTokenVideoCapability(config.model);
    if (!capability) throw new Error("当前模型尚未接入 SuperToken 异步视频协议");
    const resolutions = superTokenVideoResolutions(capability.family, config.availableVideoModels);
    const settings = normalizeSuperTokenVideoSettings(capability, resolutions, {
        resolution: config.vquality,
        aspectRatio: config.size,
        duration: Number(config.videoSeconds),
        referenceMode: config.videoReferenceMode,
        generateAudio: config.videoGenerateAudio !== "false",
    });
    const requestedResolution = settings.resolution;
    if (!resolutions.includes(requestedResolution)) throw new Error(`当前模型不支持 ${requestedResolution}，可选：${resolutions.join("、") || "无"}`);
    const model = resolveSuperTokenVideoModel(config.model, requestedResolution, config.availableVideoModels);
    if (!model) throw new Error("无法从当前账号模型列表解析对应的视频模型 SKU");

    const { referenceMode, duration, aspectRatio, generateAudio } = settings;
    const selectionError = validateSuperTokenVideoSelection({ capability, duration, aspectRatio, referenceMode, images: references.length, videos: videoReferences.length, audios: audioReferences.length, generateAudio });
    if (selectionError) throw new Error(selectionError);

    const uploadedImages = await resolveVideoSources(config, references, "image", options.signal);
    const uploadedVideos = await resolveVideoSources(config, videoReferences, "video", options.signal);
    const uploadedAudios = await resolveVideoSources(config, audioReferences, "audio", options.signal);
    const payload = buildSuperTokenVideoPayload({ model, prompt, capability, referenceMode, duration, aspectRatio, generateAudio, images: uploadedImages, videos: uploadedVideos, audios: uploadedAudios });

    const idempotencyKey = options.idempotencyKey || `canvas-video-${nanoid()}`;
    const clientReferenceId = options.clientReferenceId || idempotencyKey;
    const response = await axios.post<TaskResponse<{ videos: TaskResultVideo[] }>>(
        apiUrl(config.baseUrl, "/video/tasks"),
        { ...payload, client_reference_id: clientReferenceId },
        { headers: { ...authHeaders(config.apiKey), "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, signal: options.signal },
    );
    return persistCreatedTask("video", config, selectedModel, response.data, idempotencyKey, clientReferenceId, response.headers["retry-after"], options, model, payload);
}

export async function pollSuperTokenVideoTask(config: SuperTokenRequestConfig, task: SuperTokenTaskRecord, options: RequestOptions = {}) {
    try {
        const restored = await restoreMaterializedVideo(task);
        if (restored) return { status: "completed" as const, result: { stored: restored } };
        const response = await queryTask<{ videos: TaskResultVideo[] }>(task, config.resourceApiKey, options.signal);
        const state = response.data;
        await updateStoredTaskFromRemote(task, state, response.headers["retry-after"]);
        options.onProgress?.({ ...task });
        if (state.status === "failed") return { status: "failed" as const, error: state.error?.message || "视频生成失败" };
        if (state.status !== "succeeded") return { status: "pending" as const, progress: task.progress, progressKnown: task.progressKnown, retryAfterMs: task.retryAfterMs };
        const video = state.result?.videos?.[0];
        if (!video?.url) {
            await failStoredTask(task, "视频任务成功但没有返回视频");
            return { status: "failed" as const, error: "视频任务成功但没有返回视频" };
        }
        const stored = await materializeVideoResult(task, video, config.resourceApiKey, options.signal);
        return { status: "completed" as const, result: { stored } };
    } catch (error) {
        if (isAbort(error)) throw new DOMException("Aborted", "AbortError");
        if (axios.isAxiosError(error) && isTransientStatus(error.response?.status)) return { status: "pending" as const, progress: task.progress, progressKnown: task.progressKnown, retryAfterMs: task.retryAfterMs || DEFAULT_RETRY_MS };
        return { status: "failed" as const, error: readApiError(error) };
    }
}

export async function listSuperTokenTasks(status?: SuperTokenTaskRecord["status"]) {
    const tasks: SuperTokenTaskRecord[] = [];
    await taskStore.iterate<SuperTokenTaskRecord, void>((task) => {
        if (!status || task.status === status) tasks.push(task);
    });
    return tasks.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getSuperTokenTask(taskId: string) {
    return taskStore.getItem<SuperTokenTaskRecord>(taskId);
}

export async function removeSuperTokenTask(taskId: string) {
    await taskStore.removeItem(taskId);
}

async function waitForTask<T>(task: SuperTokenTaskRecord, resourceApiKey: string, options: RequestOptions) {
    let transientErrors = 0;
    for (;;) {
        await delay(task.retryAfterMs || DEFAULT_RETRY_MS, options.signal);
        try {
            const response = await queryTask<T>(task, resourceApiKey, options.signal);
            const state = response.data;
            transientErrors = 0;
            await updateStoredTaskFromRemote(task, state, response.headers["retry-after"]);
            options.onProgress?.({ ...task });
            if (state.status === "succeeded") return state;
            if (state.status === "failed") throw new Error(state.error?.message || "任务执行失败");
        } catch (error) {
            if (isAbort(error)) throw new DOMException("Aborted", "AbortError");
            if (axios.isAxiosError(error) && isTransientStatus(error.response?.status)) {
                transientErrors += 1;
                await delay(Math.min(15000, DEFAULT_RETRY_MS * 2 ** Math.min(transientErrors, 3)), options.signal);
                continue;
            }
            throw new Error(readApiError(error));
        }
    }
}

async function queryTask<T>(task: SuperTokenTaskRecord, resourceApiKey: string, signal?: AbortSignal) {
    if (!resourceApiKey.trim()) throw new Error("缺少 Resource API Key，无法查询异步任务");
    const path = task.kind === "image" ? `/image/tasks/${encodeURIComponent(task.id)}` : `/video/tasks/${encodeURIComponent(task.id)}`;
    return axios.get<TaskResponse<T>>(apiUrl(task.baseUrl, path), { headers: authHeaders(resourceApiKey), signal });
}

async function persistCreatedTask<T>(
    kind: SuperTokenTaskKind,
    config: SuperTokenRequestConfig,
    selectedModel: string,
    response: TaskResponse<T>,
    idempotencyKey: string,
    clientReferenceId: string,
    retryAfter: unknown,
    options: RequestOptions,
    remoteModel = config.model,
    request?: Record<string, unknown>,
) {
    if (!response.id) throw new Error("接口没有返回任务 ID");
    const now = Date.now();
    const task: SuperTokenTaskRecord = {
        id: response.id,
        kind,
        channelId: config.channelId,
        baseUrl: config.baseUrl,
        model: remoteModel,
        selectedModel,
        idempotencyKey,
        clientReferenceId,
        status: response.status === "failed" ? "failed" : "pending",
        ...mergeSuperTokenTaskProgress({ progress: 0, progressKnown: false }, response),
        retryAfterMs: parseRetryAfter(retryAfter),
        createdAt: now,
        updatedAt: now,
        error: response.error?.message,
        request,
        context: options.context,
    };
    await taskStore.setItem(task.id, task);
    await options.onTaskCreated?.(task);
    return task;
}

async function updateStoredTaskFromRemote<T>(task: SuperTokenTaskRecord, state: TaskResponse<T>, retryAfter?: unknown) {
    const next = toStoredTask(task, state, retryAfter);
    await taskStore.setItem(task.id, next);
    Object.assign(task, next);
}

function toStoredTask<T>(task: SuperTokenTaskRecord, state: TaskResponse<T>, retryAfter?: unknown): SuperTokenTaskRecord {
    return {
        ...task,
        status: state.status === "failed" ? "failed" : task.status === "succeeded" ? "succeeded" : "pending",
        ...mergeSuperTokenTaskProgress(task, state),
        retryAfterMs: retryAfter === undefined ? task.retryAfterMs : parseRetryAfter(retryAfter),
        updatedAt: Date.now(),
        error: state.error?.message,
    };
}

export function mergeSuperTokenTaskProgress(
    task: Pick<SuperTokenTaskRecord, "progress" | "progressKnown">,
    state: Pick<TaskResponse<unknown>, "status" | "progress" | "progress_known">,
) {
    if (state.status === "succeeded") return { progress: 100, progressKnown: true };
    const previous = clampProgress(task.progress);
    const incoming = clampProgress(state.progress);
    return {
        progress: Math.min(99, Math.max(previous, incoming)),
        progressKnown: task.progressKnown || Boolean(state.progress_known),
    };
}

function clampProgress(value: unknown) {
    const number = typeof value === "number" && Number.isFinite(value) ? value : 0;
    return Math.min(100, Math.max(0, number));
}

async function failStoredTask(task: SuperTokenTaskRecord, error: string) {
    const next = { ...task, status: "failed" as const, error, updatedAt: Date.now() };
    await taskStore.setItem(task.id, next);
    Object.assign(task, next);
}

async function restoreMaterializedImages(task: SuperTokenTaskRecord): Promise<SuperTokenGeneratedImage[] | null> {
    const current = await taskStore.getItem<SuperTokenTaskRecord>(task.id);
    if (current?.status !== "succeeded" || !current.resultStorageKeys?.length) return null;
    const images = await Promise.all(
        current.resultStorageKeys.map(async (storageKey) => {
            const blob = await getImageBlob(storageKey);
            return blob ? uploadImage(blob, storageKey) : null;
        }),
    );
    if (images.some((image) => !image)) return null;
    Object.assign(task, current);
    return (images as UploadedImage[]).map(storedImageResult);
}

async function materializeImageResults(task: SuperTokenTaskRecord, images: TaskResultImage[], resourceApiKey: string, signal?: AbortSignal) {
    return withTaskLock(task.id, async () => {
        const restored = await restoreMaterializedImages(task);
        if (restored) return restored;
        const blobs = await Promise.all(images.map((image) => downloadImageResult(image, resourceApiKey, signal)));
        const completedElsewhere = await restoreMaterializedImages(task);
        if (completedElsewhere) return completedElsewhere;
        const stored = await Promise.all(blobs.map((blob, index) => uploadImage(blob, `image:supertoken:${safeStoragePart(task.id)}:${index}`)));
        const current = (await taskStore.getItem<SuperTokenTaskRecord>(task.id)) || task;
        const next = {
            ...current,
            status: "succeeded" as const,
            progress: 100,
            progressKnown: true,
            resultUrls: images.map((image) => image.url),
            resultStorageKeys: stored.map((image) => image.storageKey),
            updatedAt: Date.now(),
            error: undefined,
        };
        await taskStore.setItem(task.id, next);
        Object.assign(task, next);
        return stored.map(storedImageResult);
    });
}

async function restoreMaterializedVideo(task: SuperTokenTaskRecord): Promise<UploadedFile | null> {
    const current = await taskStore.getItem<SuperTokenTaskRecord>(task.id);
    const storageKey = current?.status === "succeeded" ? current.resultStorageKeys?.[0] : undefined;
    if (!storageKey) return null;
    const blob = await getMediaBlob(storageKey);
    if (!blob) return null;
    Object.assign(task, current);
    return uploadMediaFile(blob, "video", storageKey);
}

async function materializeVideoResult(task: SuperTokenTaskRecord, video: TaskResultVideo, resourceApiKey: string, signal?: AbortSignal) {
    return withTaskLock(task.id, async () => {
        const restored = await restoreMaterializedVideo(task);
        if (restored) return restored;
        const blob = await downloadVideoResult(video, resourceApiKey, signal);
        const completedElsewhere = await restoreMaterializedVideo(task);
        if (completedElsewhere) return completedElsewhere;
        const stored = await uploadMediaFile(blob, "video", `video:supertoken:${safeStoragePart(task.id)}:0`);
        const current = (await taskStore.getItem<SuperTokenTaskRecord>(task.id)) || task;
        const next = {
            ...current,
            status: "succeeded" as const,
            progress: 100,
            progressKnown: true,
            resultUrls: [video.url],
            resultStorageKeys: [stored.storageKey],
            updatedAt: Date.now(),
            error: undefined,
        };
        await taskStore.setItem(task.id, next);
        Object.assign(task, next);
        return stored;
    });
}

async function resolveVideoSources(config: SuperTokenRequestConfig, sources: Array<ReferenceImage | ReferenceVideo | ReferenceAudio>, kind: MediaUploadInput["kind"], signal?: AbortSignal) {
    if (!sources.length) return [];
    const resolved = await Promise.all(
        sources.map(async (source, index) => {
            const directUrl = "url" in source ? source.url || "" : "";
            if (isHttpUrl(directUrl)) return { url: directUrl, name: sourceName(source.name, kind, index) };
            const blob = await referenceBlob(source, kind);
            return { upload: { clientId: `${kind}-${index + 1}-${source.id}`, kind, name: source.name || `${kind}-${index + 1}`, type: source.type || blob.type || defaultMime(kind), blob }, index };
        }),
    );
    const uploads = resolved.flatMap((item) => ("upload" in item && item.upload ? [item.upload] : []));
    const uploaded = uploads.length ? await uploadSuperTokenMedia(config, uploads, signal) : [];
    const uploadedByClient = new Map(uploaded.map((item) => [item.client_id, item]));
    return resolved.map((item, index): { url: string; name: string } => {
        if (typeof item.url === "string") return { url: item.url, name: item.name || sourceName("", kind, index) };
        const result = uploadedByClient.get(item.upload!.clientId);
        if (!result?.url) throw new Error(`第 ${index + 1} 个参考素材上传后没有返回 URL`);
        return { url: result.url, name: sourceName(item.upload!.name, kind, index) };
    });
}

async function uploadSuperTokenMedia(config: SuperTokenRequestConfig, inputs: MediaUploadInput[], signal?: AbortSignal) {
    let create;
    try {
        create = await axios.post<{ data?: MediaUploadSession[] }>(
            apiUrl(config.baseUrl, "/media/uploads"),
            { files: buildSuperTokenMediaUploadFiles(inputs) },
            { headers: { ...authHeaders(config.resourceApiKey), "Content-Type": "application/json" }, signal },
        );
    } catch (error) {
        throw requestStageError("创建媒体上传会话失败", error);
    }
    const sessions = create.data.data || [];
    if (sessions.length !== inputs.length) throw new Error("媒体上传会话数量与文件数量不一致");
    try {
        await Promise.all(
            sessions.map((session, index) =>
                axios.request({ method: session.method || "PUT", url: session.upload_url, headers: session.headers || {}, data: inputs[index].blob, signal }),
            ),
        );
    } catch (error) {
        if (isAbort(error)) throw new DOMException("Aborted", "AbortError");
        if (axios.isAxiosError(error) && !error.response) throw new Error("媒体直传失败：浏览器无法访问上传地址，请检查对象存储 CORS 是否允许当前站点的 PUT 请求和 Content-Type");
        throw requestStageError("媒体直传失败", error);
    }
    let complete;
    try {
        complete = await axios.post<{ data?: MediaUploadResult[] }>(
            apiUrl(config.baseUrl, "/media/uploads/complete"),
            { upload_ids: sessions.map((session) => session.id) },
            { headers: { ...authHeaders(config.resourceApiKey), "Content-Type": "application/json" }, signal },
        );
    } catch (error) {
        throw requestStageError("确认媒体上传失败", error);
    }
    return complete.data.data || [];
}

async function referenceImageFile(image: ReferenceImage) {
    const dataUrl = await imageToDataUrl(image);
    if (!dataUrl) throw new Error(`无法读取参考图：${image.name}`);
    return dataUrlToFile({ ...image, dataUrl });
}

async function referenceBlob(source: ReferenceImage | ReferenceVideo | ReferenceAudio, kind: MediaUploadInput["kind"]) {
    if (kind === "image") return fetchBlob(await imageToDataUrl(source as ReferenceImage));
    if (source.storageKey) {
        const blob = await getMediaBlob(source.storageKey);
        if (blob) return blob;
    }
    const url = "url" in source ? source.url : "";
    if (url) return fetchBlob(url);
    throw new Error(`无法读取本地${kind === "video" ? "视频" : "音频"}参考素材`);
}

async function fetchBlob(url: string) {
    if (!url) throw new Error("参考素材地址为空");
    return (await axios.get<Blob>(url, { responseType: "blob" })).data;
}

async function downloadImageResult(image: TaskResultImage, resourceApiKey: string, signal?: AbortSignal) {
    const headers = image.url_auth === "resource_api_key" ? authHeaders(resourceApiKey) : undefined;
    const blob = (await axios.get<Blob>(image.url, { headers, responseType: "blob", signal })).data;
    if (!blob.type.startsWith("image/")) throw new Error("图片结果的 MIME 类型无效");
    return blob;
}

async function downloadVideoResult(video: TaskResultVideo, resourceApiKey: string, signal?: AbortSignal) {
    const headers = video.url_auth === "resource_api_key" ? authHeaders(resourceApiKey) : undefined;
    const blob = (await axios.get<Blob>(video.url, { headers, responseType: "blob", signal })).data;
    if (!blob.type.startsWith("video/") && blob.type !== "application/octet-stream") throw new Error("视频结果的 MIME 类型无效");
    return blob;
}

export function buildSuperTokenImageOutput(model: string, request: ImageRequest) {
    const capability = superTokenImageCapability(model);
    const count = Math.min(capability?.maxOutputsPerRequest || 1, Math.max(1, Math.floor(request.count || 1)));
    const output: Record<string, unknown> = { count, format: "png" };
    if (model.startsWith("gemini-")) {
        const dimensions = request.size?.match(/^(\d+)x(\d+)$/);
        output.aspect_ratio = request.size?.includes(":") ? request.size : dimensions ? closestRatio(Number(dimensions[1]), Number(dimensions[2]), capability?.aspectRatios || ["1:1"]) : "1:1";
        output.resolution = imageResolution(request.resolution, capability?.resolutions || ["1K"]);
        output.quality = "auto";
        return output;
    }
    if (request.size && request.size !== "auto") output.size = request.size;
    if (request.quality && request.quality !== "auto") output.quality = request.quality;
    if (request.background === "transparent") output.background = "transparent";
    return output;
}

export function buildSuperTokenVideoPayload(params: {
    model: string;
    prompt: string;
    capability: NonNullable<ReturnType<typeof superTokenVideoCapability>>;
    referenceMode: SuperTokenReferenceMode;
    duration: number;
    aspectRatio: string;
    generateAudio: boolean;
    images: Array<{ url: string; name: string }>;
    videos: Array<{ url: string; name: string }>;
    audios: Array<{ url: string; name: string }>;
}) {
    const { model, prompt, capability, referenceMode, duration, aspectRatio, generateAudio, images, videos, audios } = params;
    const namedImages = referenceNames(images, "image");
    const namedVideos = referenceNames(videos, "video");
    const namedAudios = referenceNames(audios, "audio");
    const input: Record<string, unknown> = { prompt };
    if (images.length || videos.length || audios.length) input.reference_mode = referenceMode;
    const imageFields = superTokenReferenceImageFields(capability, referenceMode, namedImages);
    if (imageFields.image) input.image = imageFields.image;
    if (imageFields.referenceImages.length) input.reference_images = imageFields.referenceImages;
    if (referenceMode === "media") {
        if (namedVideos.length) input.reference_videos = namedVideos;
        if (namedAudios.length) input.reference_audios = namedAudios;
    }
    const output: Record<string, unknown> = { duration, aspect_ratio: aspectRatio };
    if (capability.audioPolicy !== "unsupported") output.generate_audio = generateAudio;
    return { model, operation: "generation" as const, input, output };
}

export function buildSuperTokenMediaUploadFiles(inputs: MediaUploadInput[]) {
    return inputs.map((item) => ({
        client_id: item.clientId,
        kind: item.kind,
        filename: item.name,
        mime_type: item.type || item.blob.type || defaultMime(item.kind),
        size_bytes: item.blob.size,
    }));
}

export function superTokenImageSlotIdempotencyKey(logId: string, slot: number) {
    return `canvas-image-${logId}-${slot}`;
}

function appendImageOutput(form: FormData, output: Record<string, unknown>) {
    const fields: Record<string, string> = { count: "n", size: "size", aspect_ratio: "aspect_ratio", resolution: "resolution", quality: "quality", format: "output_format", background: "background" };
    Object.entries(output).forEach(([key, value]) => {
        if (value !== undefined && fields[key]) form.set(fields[key], String(value));
    });
}

function canUseImageUrls(references: ReferenceImage[], mask?: ReferenceImage) {
    return references.length > 0 && references.every((item) => isHttpUrl(item.url || "")) && (!mask || isHttpUrl(mask.url || ""));
}

function imageResolution(resolution: string | undefined, available: string[]) {
    const desired = resolution || (available.includes("1K") ? "1K" : available[0]);
    return available.includes(desired) ? desired : available[0];
}

function closestRatio(width: number, height: number, ratios: string[]) {
    const target = width / Math.max(1, height);
    return ratios.reduce((best, ratio) => {
        const [w, h] = ratio.split(":").map(Number);
        const [bestW, bestH] = best.split(":").map(Number);
        return Math.abs(w / h - target) < Math.abs(bestW / bestH - target) ? ratio : best;
    });
}

function apiUrl(baseUrl: string, path: string) {
    return `${baseUrl.replace(/\/+$/, "")}/v1${path}`;
}

function authHeaders(key: string) {
    return { Authorization: `Bearer ${key}` };
}

export function parseSuperTokenRetryAfter(value: unknown, now = Date.now()) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(300000, seconds * 1000);
    if (typeof value === "string") {
        const date = Date.parse(value);
        if (Number.isFinite(date) && date > now) return Math.min(300000, date - now);
    }
    return DEFAULT_RETRY_MS;
}

function parseRetryAfter(value: unknown) {
    return parseSuperTokenRetryAfter(value);
}

function isTransientStatus(status?: number) {
    return !status || status === 404 || status === 408 || status === 425 || status === 429 || status >= 500;
}

function isAbort(error: unknown) {
    return axios.isCancel(error) || (error instanceof DOMException && error.name === "AbortError");
}

function readApiError(error: unknown) {
    if (axios.isAxiosError<{ error?: { message?: string }; message?: string }>(error)) return error.response?.data?.error?.message || error.response?.data?.message || error.message;
    return error instanceof Error ? error.message : "SuperToken 请求失败";
}

function requestStageError(stage: string, error: unknown) {
    if (isAbort(error)) return new DOMException("Aborted", "AbortError");
    return new Error(`${stage}：${readApiError(error)}`);
}

function delay(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
        const timer = window.setTimeout(resolve, ms);
        signal?.addEventListener("abort", () => {
            window.clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
    });
}

async function withTaskLock<T>(taskId: string, action: () => Promise<T>) {
    const locks = (navigator as Navigator & { locks?: { request: <R>(name: string, callback: () => Promise<R>) => Promise<R> } }).locks;
    return locks ? locks.request(`supertoken-task:${taskId}`, action) : action();
}

function isHttpUrl(value: string) {
    return /^https?:\/\//i.test(value);
}

function sourceName(name: string, kind: string, index: number) {
    const value = name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    return value || `${kind}-${index + 1}`;
}

function referenceNames<T extends { url: string; name: string }>(items: T[], kind: MediaUploadInput["kind"]) {
    return items.map((item, index) => ({ ...item, name: `${kind}-${index + 1}` }));
}

function defaultMime(kind: MediaUploadInput["kind"]) {
    return kind === "image" ? "image/png" : kind === "video" ? "video/mp4" : "audio/mpeg";
}

function storedImageResult(image: UploadedImage): SuperTokenGeneratedImage {
    return { id: nanoid(), dataUrl: image.url, storageKey: image.storageKey, width: image.width, height: image.height, bytes: image.bytes, mimeType: image.mimeType };
}

function referenceSnapshot(reference: ReferenceImage) {
    const sourceUrl = reference.url || reference.dataUrl || "";
    return {
        id: reference.id,
        name: reference.name,
        type: reference.type,
        ...(reference.storageKey ? { storageKey: reference.storageKey } : {}),
        ...(isHttpUrl(sourceUrl) ? { url: sourceUrl } : {}),
    };
}

function safeStoragePart(value: string) {
    return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
}
