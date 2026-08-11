import axios from "axios";

import i18n from "@/i18n";

type ApiErrorDetails = { message: string; code: string };

const apiText = (key: string, options?: Record<string, unknown>) => i18n.t(`apiErrors.${key}`, options);

export function formatApiErrorPayload(value: unknown, fallback = "", status?: number) {
    const details = readErrorDetails(value);
    const message = details.message || statusMessage(status, fallback);
    if (!message) return details.code ? `code: ${details.code}` : fallback;
    if (!details.code || message.includes(`code: ${details.code}`)) return message;
    return `${message}\ncode: ${details.code}`;
}

export async function apiErrorMessage(error: unknown, fallback: string) {
    if (isApiRequestCanceled(error)) return apiText("requestCanceled");
    if (axios.isAxiosError(error)) {
        const responseData = await readableResponseData(error.response?.data);
        const formatted = formatApiErrorPayload(responseData, "", error.response?.status);
        return formatted || error.message || fallback;
    }
    if (error instanceof Error) {
        return formatApiErrorPayload({ message: error.message, code: errorCode(error) }, fallback);
    }
    return formatApiErrorPayload(error, fallback);
}

export function isApiRequestCanceled(error: unknown) {
    return axios.isCancel(error) || (error instanceof Error && error.name === "AbortError");
}

function readErrorDetails(value: unknown, depth = 0): ApiErrorDetails {
    if (depth > 6 || value == null) return { message: "", code: "" };
    if (typeof value === "string") return readStringError(value, depth);
    if (typeof value === "number" || typeof value === "boolean") return { message: String(value), code: "" };
    if (Array.isArray(value)) return mergeErrorDetails(value.map((item) => readErrorDetails(item, depth + 1)));
    if (typeof value !== "object" || value instanceof Blob || value instanceof ArrayBuffer) return { message: "", code: "" };

    const record = value as Record<string, unknown>;
    const validationMessage = validationErrorMessage(record);
    const nestedError = readErrorDetails(record.error, depth + 1);
    const detail = readErrorDetails(record.detail, depth + 1);
    const response = readErrorDetails(record.response, depth + 1);
    const message = firstMessage(
        validationMessage,
        readErrorDetails(record.message, depth + 1).message,
        readErrorDetails(record.msg, depth + 1).message,
        readErrorDetails(record.error_description, depth + 1).message,
        nestedError.message,
        detail.message,
        readErrorDetails(record.reason, depth + 1).message,
        response.message,
    );
    const code = firstCode(scalarCode(record.code), scalarCode(record.error_code), nestedError.code, detail.code, response.code, validationMessage ? scalarCode(record.type) : "");
    return { message, code };
}

function readStringError(value: string, depth: number): ApiErrorDetails {
    const text = value.trim();
    if (!text) return { message: "", code: "" };
    try {
        const parsed = JSON.parse(text);
        const details = readErrorDetails(parsed, depth + 1);
        if (details.message || details.code) return details;
        if (parsed && typeof parsed === "object") return { message: "", code: "" };
    } catch {
        // Plain-text error.
    }
    if (/<[a-z][\s\S]*>/i.test(text)) return { message: apiText("htmlError", { preview: `${text.slice(0, 80)}...` }), code: "" };
    return { message: text, code: "" };
}

function validationErrorMessage(record: Record<string, unknown>) {
    const message = typeof record.msg === "string" ? record.msg.trim() : "";
    if (!message || !Array.isArray(record.loc)) return "";
    const path = record.loc.map(String).filter(Boolean).join(".");
    return path ? `${path}: ${message}` : message;
}

function mergeErrorDetails(items: ApiErrorDetails[]): ApiErrorDetails {
    const messages = Array.from(new Set(items.map((item) => item.message).filter(Boolean)));
    const codes = Array.from(new Set(items.map((item) => item.code).filter(Boolean)));
    return { message: messages.join("\n"), code: codes.length === 1 ? codes[0] : "" };
}

function firstMessage(...values: string[]) {
    return values.find(Boolean) || "";
}

function firstCode(...values: string[]) {
    return values.find((value) => value && value !== "0") || "";
}

function scalarCode(value: unknown) {
    return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function errorCode(error: Error) {
    return scalarCode((error as Error & { code?: unknown }).code);
}

async function readableResponseData(value: unknown) {
    if (value instanceof Blob) {
        const text = await value.text();
        return text || undefined;
    }
    if (value instanceof ArrayBuffer) return new TextDecoder().decode(value);
    return value;
}

function statusMessage(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return apiText("authenticationFailed");
    if (status === 429) return apiText("rateLimited");
    if (status === 404) return apiText("notFound");
    if (status === 502) return apiText("badGateway");
    if (status === 503) return apiText("serviceBusy");
    return status ? apiText("httpFailed", { status }) : fallback;
}
