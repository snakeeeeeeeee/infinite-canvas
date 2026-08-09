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
const {
    buildSuperTokenImageOutput,
    buildSuperTokenMediaUploadFiles,
    buildSuperTokenVideoPayload,
    mergeSuperTokenTaskProgress,
    parseSuperTokenRetryAfter,
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
        expect(superTokenReferenceDurationError("leonardo-seedance-2.5-720p", [video(10093)], [audio(15093)])).toBe("");
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

    test("maps media upload metadata without file contents or keys", () => {
        const files = buildSuperTokenMediaUploadFiles([
            { clientId: "image-1", kind: "image", name: "start.png", type: "", blob: new Blob(["image"], { type: "image/png" }) },
        ]);
        expect(files).toEqual([{ client_id: "image-1", kind: "image", filename: "start.png", mime_type: "image/png", size_bytes: 5 }]);
    });
});

describe("SuperToken async controls", () => {
    test("keeps known task progress monotonic and clamps pending values", () => {
        expect(mergeSuperTokenTaskProgress({ progress: 64, progressKnown: true }, { status: "in_progress", progress: 28, progress_known: true })).toEqual({ progress: 64, progressKnown: true });
        expect(mergeSuperTokenTaskProgress({ progress: 64, progressKnown: true }, { status: "in_progress", progress: 120, progress_known: true })).toEqual({ progress: 99, progressKnown: true });
    });

    test("does not forget a previously known progress value", () => {
        expect(mergeSuperTokenTaskProgress({ progress: 42, progressKnown: true }, { status: "in_progress", progress_known: false })).toEqual({ progress: 42, progressKnown: true });
        expect(mergeSuperTokenTaskProgress({ progress: 0, progressKnown: false }, { status: "queued", progress: -10, progress_known: false })).toEqual({ progress: 0, progressKnown: false });
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
