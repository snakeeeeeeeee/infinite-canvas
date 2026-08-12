import { describe, expect, test } from "bun:test";

if (!("localStorage" in globalThis)) {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
        value: {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => values.set(key, value),
            removeItem: (key: string) => values.delete(key),
            clear: () => values.clear(),
            key: (index: number) => Array.from(values.keys())[index] ?? null,
            get length() {
                return values.size;
            },
        } satisfies Storage,
    });
}

const { superTokenVideoCapability } = await import("../src/lib/supertoken-capabilities");
const { superTokenReferenceDurationError } = await import("../src/lib/seedance-video");
const { buildSuperTokenImageRequest } = await import("../src/services/api/image");
const {
    buildSuperTokenImageOutput,
    buildSuperTokenImageTaskPayload,
    buildSuperTokenMediaUploadFiles,
    buildSuperTokenVideoPayload,
    formatSuperTokenTaskError,
    isSuperTokenMediaUploadReusable,
    isSuperTokenReferenceMediaUnavailable,
    mergeSuperTokenTaskProgress,
    mergeSuperTokenTaskRemoteState,
    parseSuperTokenRetryAfter,
    superTokenMediaUploadCacheKey,
    superTokenImageSlotIdempotencyKey,
} = await import("../src/services/api/supertoken");

describe("SuperToken request mapping", () => {
    test("accepts Adobe Seedance encoding tail variance and rejects material overruns", () => {
        const video = (durationMs: number) => [{ id: "video-1", name: "motion.mp4", type: "video/mp4", url: "https://example.com/motion.mp4", durationMs }];
        const audio = (durationMs: number) => [{ id: "audio-1", name: "music.mp3", type: "audio/mpeg", url: "https://example.com/music.mp3", durationMs }];

        expect(superTokenReferenceDurationError("adobe-seedance-2.0-480p", video(15000), [])).toBe("");
        expect(superTokenReferenceDurationError("adobe-seedance-2.0-480p", video(15093), audio(15093))).toBe("");
        expect(superTokenReferenceDurationError("adobe-seedance-2.0-480p", video(15301), [])).toContain("15.3");
        expect(superTokenReferenceDurationError("adobe-seedance-2.0-480p", [], audio(15301))).toContain("15.3");
    });

    test("uses Leonardo video and audio limits with normalized combined durations", () => {
        const video = (durationMs: number, id = "video-1") => ({ id, name: `${id}.mp4`, type: "video/mp4", url: `https://example.com/${id}.mp4`, durationMs });
        const audio = (durationMs: number, id = "audio-1") => ({ id, name: `${id}.mp3`, type: "audio/mpeg", url: `https://example.com/${id}.mp3`, durationMs });
        const model = "leonardo-seedance-2.0-fast-480p";

        expect(superTokenReferenceDurationError(model, [video(10000)], [audio(15000)])).toBe("");
        expect(superTokenReferenceDurationError(model, [video(10093)], [audio(15093)])).toBe("");
        expect(superTokenReferenceDurationError(model, [video(10301)], [])).toContain("10.3");
        expect(superTokenReferenceDurationError(model, [], [audio(15301)])).toContain("15.3");
        expect(superTokenReferenceDurationError("leonardo-seedance-2.5-720p", [video(10000), video(10000, "video-2"), video(10093, "video-3")], [audio(15000), audio(15093, "audio-2")])).toBe("");
        expect(superTokenReferenceDurationError("leonardo-seedance-2.5-720p", [video(10000), video(10000, "video-2"), video(10000, "video-3"), video(3000, "video-4")], [])).toContain("30.2");
        expect(superTokenReferenceDurationError("leonardo-seedance-2.5-720p", [], [audio(10100), audio(10100, "audio-2"), audio(10100, "audio-3")])).toContain("30.2");
        expect(superTokenReferenceDurationError(model, [video(5000), video(10093, "video-2")], [])).toBe("");
        expect(superTokenReferenceDurationError(model, [video(5100), video(10093, "video-2")], [])).toContain("15");
        expect(superTokenReferenceDurationError("leonardo-minimax-h3-1440p", [], [audio(15093)])).toBe("");
        expect(superTokenReferenceDurationError("leonardo-minimax-h3-1440p", [], [audio(7500), audio(7500, "audio-2")])).toBe("");
        expect(superTokenReferenceDurationError("leonardo-minimax-h3-1440p", [], [audio(7600), audio(7500, "audio-2")])).toContain("15");
    });

    test("maps Gemini image output to async task fields", () => {
        expect(
            buildSuperTokenImageOutput("gemini-3.1-flash-image", {
                prompt: "test",
                references: [],
                size: "16:9",
                quality: "auto",
                resolution: "2K",
            }),
        ).toEqual({ count: 1, format: "png", aspect_ratio: "16:9", resolution: "2K", quality: "auto" });
    });

    test("maps Grok image generation and ordered edits with an output whitelist", () => {
        const generation = buildSuperTokenImageTaskPayload("grok-imagine-image", {
            prompt: "test",
            references: [],
            size: "16:9",
            quality: "high",
            resolution: "2K",
            background: "transparent",
            count: 4,
        });
        expect(generation).toEqual({
            model: "grok-imagine-image",
            operation: "generation",
            input: { prompt: "test" },
            output: { count: 1, aspect_ratio: "16:9", resolution: "2k" },
        });
        expect(generation.output).not.toHaveProperty("size");
        expect(generation.output).not.toHaveProperty("quality");
        expect(generation.output).not.toHaveProperty("background");
        expect(generation.output).not.toHaveProperty("format");

        const edit = buildSuperTokenImageTaskPayload("grok-imagine-image-quality", {
            prompt: "edit",
            references: [
                { id: "first", name: "first.png", type: "image/png", url: "https://example.com/first.png", dataUrl: "" },
                { id: "second", name: "second.jpg", type: "image/jpeg", url: "https://example.com/second.jpg", dataUrl: "" },
            ],
            size: "3:2",
            resolution: "1k",
        });
        expect(edit.operation).toBe("edit");
        expect(edit.input).toEqual({ prompt: "edit", images: [{ url: "https://example.com/first.png" }, { url: "https://example.com/second.jpg" }] });
        expect(edit.output).toEqual({ count: 1, aspect_ratio: "3:2", resolution: "1k" });
    });

    test("preserves every Grok aspect ratio through the shared generation and edit mapping", () => {
        const config = { quality: "auto", imageResolution: "2k", size: "1:1", background: "" };
        const ratios = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"];
        ratios.forEach((size) => {
            expect(buildSuperTokenImageRequest("grok-imagine-image", { ...config, size }, { prompt: "generate", references: [] }).size).toBe(size);
        });

        const references = [
            { id: "first", name: "first.png", type: "image/png", url: "https://example.com/first.png", dataUrl: "" },
            { id: "second", name: "second.jpg", type: "image/jpeg", url: "https://example.com/second.jpg", dataUrl: "" },
        ];
        const edit = buildSuperTokenImageRequest("grok-imagine-image-quality", { ...config, size: "9:16" }, { prompt: "edit", references });
        expect(edit.size).toBe("9:16");
        expect(edit.references).toEqual(references);
        expect(buildSuperTokenImageRequest("gemini-3.1-flash-image", { ...config, size: "4:3" }, { prompt: "generate", references: [] }).size).toBe("4:3");
        expect(buildSuperTokenImageRequest("gpt-image-2", { ...config, size: "9:16" }, { prompt: "generate", references: [] }).size).toBe("1024x1824");
    });

    test("maps native multi-image counts only for models that support them", () => {
        expect(buildSuperTokenImageOutput("gpt-image-2", { prompt: "test", references: [], count: 6 })).toEqual({ count: 6, format: "png" });
        expect(buildSuperTokenImageOutput("adobe-gpt-image-2-count", { prompt: "test", references: [], count: 4 })).toEqual({ count: 4, format: "png" });
        expect(buildSuperTokenImageOutput("gpt-image-2-count", { prompt: "test", references: [], count: 4 })).toEqual({ count: 1, format: "png" });
    });

    test("assigns globally unique ordered names to Seedance media references", () => {
        const payload = buildSuperTokenVideoPayload({
            model: "leonardo-seedance-2.0-fast-480p",
            prompt: "test",
            capability: superTokenVideoCapability("leonardo-seedance-2.0-fast")!,
            referenceMode: "media",
            duration: 4,
            aspectRatio: "16:9",
            generateAudio: true,
            images: [
                { url: "https://example.com/image-1.png", name: "same-name" },
                { url: "https://example.com/image-2.png", name: "same-name" },
            ],
            videos: [{ url: "https://example.com/video.mp4", name: "same-name" }],
            audios: [{ url: "https://example.com/audio.mp3", name: "same-name" }],
        });
        expect(payload.input).toEqual({
            prompt: "test",
            reference_mode: "media",
            reference_images: [
                { url: "https://example.com/image-1.png", name: "image-1" },
                { url: "https://example.com/image-2.png", name: "image-2" },
            ],
            reference_videos: [{ url: "https://example.com/video.mp4", name: "video-1" }],
            reference_audios: [{ url: "https://example.com/audio.mp3", name: "audio-1" }],
        });
        expect(payload.output).toEqual({ duration: 4, aspect_ratio: "16:9", generate_audio: true });
        expect(payload.output).not.toHaveProperty("resolution");
    });

    test("keeps four same-title Seedance Canvas images ordered with unique names", () => {
        const images = [1, 2, 3, 4].map((index) => ({ url: `https://example.com/reference-${index}.png`, name: "Generated-Image" }));
        const payload = buildSuperTokenVideoPayload({
            model: "adobe-seedance-2.0-480p",
            prompt: "test",
            capability: superTokenVideoCapability("adobe-seedance-2.0")!,
            referenceMode: "media",
            duration: 4,
            aspectRatio: "16:9",
            generateAudio: true,
            images,
            videos: [],
            audios: [],
        });
        expect(payload.input.reference_images).toEqual([
            { url: "https://example.com/reference-1.png", name: "image-1" },
            { url: "https://example.com/reference-2.png", name: "image-2" },
            { url: "https://example.com/reference-3.png", name: "image-3" },
            { url: "https://example.com/reference-4.png", name: "image-4" },
        ]);
        expect(images.every((image) => image.name === "Generated-Image")).toBe(true);
    });

    test("maps MiniMax frame images to ordered first and last frames", () => {
        const payload = buildSuperTokenVideoPayload({
            model: "leonardo-minimax-h3-1440p",
            prompt: "test",
            capability: superTokenVideoCapability("leonardo-minimax-h3")!,
            referenceMode: "frame",
            duration: 5,
            aspectRatio: "16:9",
            generateAudio: true,
            images: [
                { url: "https://example.com/start.png", name: "start" },
                { url: "https://example.com/end.png", name: "end" },
            ],
            videos: [],
            audios: [],
        });
        expect(payload.input).toEqual({
            prompt: "test",
            reference_mode: "frame",
            image: { url: "https://example.com/start.png", name: "image-1" },
            reference_images: [{ url: "https://example.com/end.png", name: "image-2" }],
        });
    });

    test("maps Grok text, single-image, and two-image video requests", () => {
        const capability = superTokenVideoCapability("grok-imagine-video-1.5-preview")!;
        const build = (referenceMode: "frame" | "media", images: Array<{ url: string; name: string }>) => buildSuperTokenVideoPayload({
            model: "grok-imagine-video-1.5-preview-720p",
            prompt: "test",
            capability,
            referenceMode,
            duration: 1,
            aspectRatio: "16:9",
            generateAudio: false,
            images,
            videos: [],
            audios: [],
        });

        expect(build("frame", [])).toEqual({
            model: "grok-imagine-video-1.5-preview-720p",
            operation: "generation",
            input: { prompt: "test" },
            output: { duration: 1, aspect_ratio: "16:9" },
        });
        expect(build("frame", [{ url: "https://example.com/start.png", name: "start" }]).input).toEqual({
            prompt: "test",
            reference_mode: "frame",
            image: { url: "https://example.com/start.png", name: "image-1" },
        });
        expect(build("media", [
            { url: "https://example.com/one.png", name: "one" },
            { url: "https://example.com/two.png", name: "two" },
        ]).input).toEqual({
            prompt: "test",
            reference_mode: "media",
            reference_images: [
                { url: "https://example.com/one.png", name: "image-1" },
                { url: "https://example.com/two.png", name: "image-2" },
            ],
        });
    });

    test("maps media upload metadata without file contents or keys", () => {
        const files = buildSuperTokenMediaUploadFiles([
            { clientId: "image-1", kind: "image", name: "start.png", type: "", blob: new Blob(["image"], { type: "image/png" }), cacheKey: "private-cache-key" },
        ]);
        expect(files).toEqual([{ client_id: "image-1", kind: "image", filename: "start.png", mime_type: "image/png", size_bytes: 5 }]);
    });

    test("refreshes temporary media uploads within the 30 minute safety window", () => {
        const now = Date.UTC(2026, 7, 10, 6, 0, 0);
        const nowSeconds = Math.floor(now / 1000);
        expect(isSuperTokenMediaUploadReusable({ url: "https://img.example/fresh.mp4", temporary: true, expires_at: nowSeconds + 1801 }, now)).toBe(true);
        expect(isSuperTokenMediaUploadReusable({ url: "https://img.example/boundary.mp4", temporary: true, expires_at: nowSeconds + 1800 }, now)).toBe(false);
        expect(isSuperTokenMediaUploadReusable({ url: "https://img.example/expired.mp4", temporary: true, expires_at: nowSeconds - 1 }, now)).toBe(false);
        expect(isSuperTokenMediaUploadReusable({ url: "https://img.example/permanent.mp4", temporary: false, expires_at: 0 }, now)).toBe(true);
    });

    test("isolates upload caches by channel, endpoint, and local storage key", () => {
        const first = superTokenMediaUploadCacheKey("channel-1", "https://HK.SuperToken.cc/", "video:1");
        expect(first).toBe("channel-1:https://hk.supertoken.cc:video:1");
        expect(superTokenMediaUploadCacheKey("channel-2", "https://hk.supertoken.cc", "video:1")).not.toBe(first);
        expect(superTokenMediaUploadCacheKey("channel-1", "https://api.supertoken.cc", "video:1")).not.toBe(first);
        expect(superTokenMediaUploadCacheKey("channel-1", "https://hk.supertoken.cc", "video:2")).not.toBe(first);
    });

    test("retries missing, expired, or failed reference downloads", () => {
        expect(isSuperTokenReferenceMediaUnavailable({ error: { code: "reference_media_expired", message: "reference expired" } })).toBe(true);
        expect(isSuperTokenReferenceMediaUnavailable({ error: { code: "reference_download_failed", message: "reference download failed" } })).toBe(true);
        expect(isSuperTokenReferenceMediaUnavailable({ code: "invalid_request", message: "reference download failed" })).toBe(true);
        expect(isSuperTokenReferenceMediaUnavailable({ detail: { code: "invalid_reference_media", message: "staged media is missing or incomplete" } })).toBe(true);
        expect(isSuperTokenReferenceMediaUnavailable({ code: "video_task_failed", message: "reference media not found" })).toBe(true);
        expect(isSuperTokenReferenceMediaUnavailable(new Error("确认媒体上传失败：upload not found"))).toBe(true);
        expect(isSuperTokenReferenceMediaUnavailable({ code: "invalid_reference_media_duration", message: "reference video exceeds 15 seconds" })).toBe(false);
        expect(isSuperTokenReferenceMediaUnavailable({ code: "upstream_unavailable", message: "generation service unavailable" })).toBe(false);
    });

    test("keeps the task error message and code for user-facing failures", () => {
        expect(
            formatSuperTokenTaskError(
                {
                    code: "new_api_error",
                    message: 'adobe content rejected: status 451 {"error_code":"image_unsafe","message":"The generated images appear to be unsafe."}',
                },
                "任务执行失败",
            ),
        ).toBe('adobe content rejected: status 451 {"error_code":"image_unsafe","message":"The generated images appear to be unsafe."}\ncode: new_api_error');
        expect(formatSuperTokenTaskError({ message: "plain failure" }, "任务执行失败")).toBe("plain failure");
        expect(formatSuperTokenTaskError(null, "任务执行失败")).toBe("任务执行失败");
    });
});

describe("SuperToken async controls", () => {
    test("preserves the submitted public model snapshot when polling reports an upstream model", () => {
        const task = {
            id: "task-preview",
            kind: "video" as const,
            channelId: "supertoken",
            baseUrl: "https://api.supertoken.cc",
            model: "grok-imagine-video-1.5-preview-720p",
            selectedModel: "supertoken::grok-imagine-video-1.5-preview",
            idempotencyKey: "idem",
            clientReferenceId: "client",
            status: "pending" as const,
            progress: 20,
            progressKnown: true,
            retryAfterMs: 2000,
            createdAt: 1,
            updatedAt: 1,
        };
        const next = mergeSuperTokenTaskRemoteState(task, { id: task.id, model: "grok-imagine-video-1.5", status: "in_progress", progress: 40, progress_known: true });
        expect(next.model).toBe("grok-imagine-video-1.5-preview-720p");
        expect(next.selectedModel).toBe("supertoken::grok-imagine-video-1.5-preview");
        expect(next.progress).toBe(40);
    });

    test("keeps known task progress monotonic and clamps pending values", () => {
        expect(mergeSuperTokenTaskProgress({ progress: 64, progressKnown: true }, { status: "in_progress", progress: 28, progress_known: true })).toEqual({ progress: 64, progressKnown: true });
        expect(mergeSuperTokenTaskProgress({ progress: 64, progressKnown: true }, { status: "in_progress", progress: 120, progress_known: true })).toEqual({ progress: 99, progressKnown: true });
    });

    test("uses numeric progress regardless of progress_known and keeps missing progress indeterminate", () => {
        expect(mergeSuperTokenTaskProgress({ progress: 42, progressKnown: true }, { status: "in_progress", progress_known: false })).toEqual({ progress: 42, progressKnown: true });
        expect(mergeSuperTokenTaskProgress({ progress: 0, progressKnown: false }, { status: "queued", progress: 43, progress_known: false })).toEqual({ progress: 43, progressKnown: true });
        expect(mergeSuperTokenTaskProgress({ progress: 0, progressKnown: false }, { status: "queued", progress: -10, progress_known: false })).toEqual({ progress: 0, progressKnown: true });
        expect(mergeSuperTokenTaskProgress({ progress: 0, progressKnown: false }, { status: "queued", progress_known: true })).toEqual({ progress: 0, progressKnown: false });
    });

    test("marks succeeded tasks as complete only after the remote terminal state", () => {
        expect(mergeSuperTokenTaskProgress({ progress: 73, progressKnown: true }, { status: "succeeded", progress: 73, progress_known: true })).toEqual({ progress: 100, progressKnown: true });
    });

    test("uses stable independent idempotency keys for image slots", () => {
        expect(superTokenImageSlotIdempotencyKey("log-1", 0)).toBe("canvas-image-log-1-0");
        expect(superTokenImageSlotIdempotencyKey("log-1", 1)).not.toBe(superTokenImageSlotIdempotencyKey("log-1", 0));
    });

    test("honors numeric and HTTP-date Retry-After values", () => {
        const now = Date.UTC(2026, 7, 6, 12, 0, 0);
        expect(parseSuperTokenRetryAfter("3", now)).toBe(3000);
        expect(parseSuperTokenRetryAfter(new Date(now + 12000).toUTCString(), now)).toBe(12000);
        expect(parseSuperTokenRetryAfter("invalid", now)).toBe(2000);
    });
});
