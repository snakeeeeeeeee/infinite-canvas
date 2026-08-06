import { describe, expect, test } from "bun:test";

import { superTokenVideoCapability } from "../src/lib/supertoken-capabilities";
import {
    buildSuperTokenImageOutput,
    buildSuperTokenMediaUploadFiles,
    buildSuperTokenVideoPayload,
    parseSuperTokenRetryAfter,
    superTokenImageSlotIdempotencyKey,
} from "../src/services/api/supertoken";

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

    test("maps Seedance media and omits duplicate resolution", () => {
        const payload = buildSuperTokenVideoPayload({
            model: "leonardo-seedance-2.0-fast-480p",
            prompt: "test",
            capability: superTokenVideoCapability("leonardo-seedance-2.0-fast")!,
            referenceMode: "media",
            duration: 4,
            aspectRatio: "16:9",
            generateAudio: true,
            images: [{ url: "https://example.com/image.png", name: "image" }],
            videos: [{ url: "https://example.com/video.mp4", name: "video" }],
            audios: [{ url: "https://example.com/audio.mp3", name: "audio" }],
        });
        expect(payload.input).toEqual({
            prompt: "test",
            reference_mode: "media",
            reference_images: [{ url: "https://example.com/image.png", name: "image" }],
            reference_videos: [{ url: "https://example.com/video.mp4", name: "video" }],
            reference_audios: [{ url: "https://example.com/audio.mp3", name: "audio" }],
        });
        expect(payload.output).toEqual({ duration: 4, aspect_ratio: "16:9", generate_audio: true });
        expect(payload.output).not.toHaveProperty("resolution");
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
            image: { url: "https://example.com/start.png", name: "start" },
            reference_images: [{ url: "https://example.com/end.png", name: "end" }],
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
