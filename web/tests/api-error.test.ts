import { describe, expect, test } from "bun:test";

const { apiErrorMessage, formatApiErrorPayload } = await import("../src/services/api/api-error");

describe("API error formatting", () => {
    test("preserves top-level and nested server codes with their messages", () => {
        expect(formatApiErrorPayload({ code: "invalid_request", message: "reference names must be unique" }, "请求失败")).toBe("reference names must be unique\ncode: invalid_request");
        expect(formatApiErrorPayload({ error: { code: "image_unsafe", message: "The generated image was rejected" } }, "请求失败")).toBe("The generated image was rejected\ncode: image_unsafe");
        expect(formatApiErrorPayload('{"error":{"code":"quota_exceeded","message":"Quota exceeded"}}', "请求失败")).toBe("Quota exceeded\ncode: quota_exceeded");
    });

    test("reduces validation arrays without exposing their input payload", () => {
        const payload = {
            detail: [
                { type: "greater_than_equal", loc: ["body", "duration"], msg: "Input should be greater than or equal to 5", input: 3 },
                { type: "literal_error", loc: ["body", "ratio"], msg: "Input should be a supported ratio", input: "bad" },
            ],
        };
        const message = formatApiErrorPayload(payload, "请求失败");
        expect(message).toContain("body.duration: Input should be greater than or equal to 5");
        expect(message).toContain("body.ratio: Input should be a supported ratio");
        expect(message).not.toContain('"bad"');
    });

    test("reads JSON errors wrapped in Blob Axios responses", async () => {
        const error = {
            isAxiosError: true,
            message: "Request failed with status code 400",
            response: {
                status: 400,
                data: new Blob([JSON.stringify({ error: { code: "invalid_media", message: "Reference video is too long" } })], { type: "application/json" }),
            },
        };
        expect(await apiErrorMessage(error, "请求失败")).toBe("Reference video is too long\ncode: invalid_media");
    });

    test("falls back to a readable HTTP status when the body is empty", async () => {
        const error = { isAxiosError: true, message: "Request failed", response: { status: 400, data: {} } };
        expect(await apiErrorMessage(error, "请求失败")).toContain("400");
    });
});
