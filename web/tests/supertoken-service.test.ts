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
const {
    buildSuperTokenImageOutput,
    buildSuperTokenMediaUploadFiles,
    buildSuperTokenVideoPayload,
    parseSuperTokenRetryAfter,
    superTokenImageSlotIdempotencyKey,
} = await import("../src/services/api/supertoken");

describe("SuperToken request mapping", () => {
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
