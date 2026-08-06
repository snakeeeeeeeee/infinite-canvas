import { superTokenBaseUrl, type SuperTokenRegion } from "@/lib/supertoken-capabilities";
import { createSuperTokenChannel, type ModelChannel } from "@/stores/use-config-store";

export const SUPERTOKEN_AUTHORIZATION_MESSAGE = "infinite-canvas:supertoken-authorization";
const SUPERTOKEN_CLIENT_ID = "infinite-canvas";
const CALLBACK_PATH = "/auth/supertoken/callback";

export type SuperTokenAuthorizationCallback = {
    type: typeof SUPERTOKEN_AUTHORIZATION_MESSAGE;
    state: string;
    code?: string;
    error?: string;
    errorDescription?: string;
};

export type SuperTokenAuthorizationResult = {
    token_type: "Bearer";
    image_api_key: string;
    video_api_key: string;
    resource_api_key: string;
    image_models: string[];
    video_models: string[];
    authorized_at: number;
};

export class SuperTokenAuthorizationError extends Error {
    constructor(
        public readonly code: string,
        message: string,
    ) {
        super(message);
        this.name = "SuperTokenAuthorizationError";
    }
}

export async function authorizeSuperToken(region: SuperTokenRegion): Promise<SuperTokenAuthorizationResult> {
    const state = randomBase64Url(32);
    const codeVerifier = randomBase64Url(64);
    const popup = openAuthorizationPopup();
    let codeChallenge: string;
    try {
        codeChallenge = await superTokenPkceChallenge(codeVerifier);
    } catch (error) {
        popup.close();
        throw error;
    }
    const redirectUri = `${window.location.origin}${CALLBACK_PATH}`;
    const baseUrl = superTokenBaseUrl(region).replace(/\/+$/, "");
    const authorizeUrl = new URL("/canvas/authorize", `${baseUrl}/`);
    authorizeUrl.search = new URLSearchParams({
        client_id: SUPERTOKEN_CLIENT_ID,
        redirect_uri: redirectUri,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
    }).toString();

    popup.location.replace(authorizeUrl.toString());
    const callback = await waitForAuthorizationCallback(popup, state, new URL(redirectUri).origin);
    if (callback.error) {
        throw new SuperTokenAuthorizationError(callback.error, callback.errorDescription || authorizationErrorMessage(callback.error));
    }
    if (!callback.code) throw new SuperTokenAuthorizationError("invalid_response", "授权服务没有返回授权码");

    return exchangeAuthorizationCode(baseUrl, {
        grant_type: "authorization_code",
        client_id: SUPERTOKEN_CLIENT_ID,
        code: callback.code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
    });
}

export function authorizedSuperTokenChannel(
    channel: ModelChannel,
    region: SuperTokenRegion,
    result: SuperTokenAuthorizationResult,
    syncedAt = Date.now(),
) {
    return createSuperTokenChannel({
        ...channel,
        provider: "supertoken",
        supertoken: {
            region,
            imageApiKey: result.image_api_key,
            videoApiKey: result.video_api_key,
            resourceApiKey: result.resource_api_key,
            imageModels: result.image_models,
            videoModels: result.video_models,
            syncedAt,
            authorizedAt: result.authorized_at * 1000,
        },
    });
}

export function parseSuperTokenAuthorizationCallback(search: string): SuperTokenAuthorizationCallback {
    const params = new URLSearchParams(search);
    return {
        type: SUPERTOKEN_AUTHORIZATION_MESSAGE,
        state: params.get("state") || "",
        code: params.get("code") || undefined,
        error: params.get("error") || undefined,
        errorDescription: params.get("error_description") || undefined,
    };
}

export function isExpectedSuperTokenAuthorizationMessage(
    event: Pick<MessageEvent, "origin" | "source" | "data">,
    popup: Window,
    expectedOrigin: string,
    expectedState: string,
) {
    if (event.origin !== expectedOrigin || event.source !== popup || !isAuthorizationCallback(event.data)) return false;
    if (event.data.state !== expectedState) throw new SuperTokenAuthorizationError("state_mismatch", "授权状态校验失败，请重新连接");
    return true;
}

function openAuthorizationPopup() {
    const width = Math.min(520, window.screen.availWidth);
    const height = Math.min(760, window.screen.availHeight);
    const left = window.screenX + Math.max(0, Math.round((window.outerWidth - width) / 2));
    const top = window.screenY + Math.max(0, Math.round((window.outerHeight - height) / 2));
    const popup = window.open("", "infinite-canvas-supertoken", `popup=yes,width=${width},height=${height},left=${left},top=${top}`);
    if (!popup) throw new SuperTokenAuthorizationError("popup_blocked", "浏览器阻止了授权窗口，请允许弹窗后重试");
    popup.focus();
    return popup;
}

function waitForAuthorizationCallback(popup: Window, state: string, expectedOrigin: string) {
    return new Promise<SuperTokenAuthorizationCallback>((resolve, reject) => {
        let settled = false;
        const finish = (callback: () => void) => {
            if (settled) return;
            settled = true;
            window.removeEventListener("message", onMessage);
            window.clearInterval(closeTimer);
            window.clearTimeout(timeoutTimer);
            if (!popup.closed) popup.close();
            callback();
        };
        const onMessage = (event: MessageEvent) => {
            try {
                if (!isExpectedSuperTokenAuthorizationMessage(event, popup, expectedOrigin, state)) return;
                finish(() => resolve(event.data));
            } catch (error) {
                finish(() => reject(error));
            }
        };
        window.addEventListener("message", onMessage);
        const closeTimer = window.setInterval(() => {
            if (popup.closed) finish(() => reject(new SuperTokenAuthorizationError("popup_closed", "授权窗口已关闭，现有配置未更改")));
        }, 300);
        const timeoutTimer = window.setTimeout(() => {
            finish(() => reject(new SuperTokenAuthorizationError("authorization_timeout", "授权等待超时，请重新连接")));
        }, 5 * 60 * 1000);
    });
}

async function exchangeAuthorizationCode(baseUrl: string, payload: Record<string, string>) {
    let response: Response;
    try {
        response = await fetch(`${baseUrl}/api/canvas/oauth/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            cache: "no-store",
        });
    } catch {
        throw new SuperTokenAuthorizationError("network_error", "无法连接 SuperToken 授权服务");
    }
    const body = (await response.json().catch(() => null)) as (SuperTokenAuthorizationResult & { error?: string; error_description?: string }) | null;
    if (!response.ok || !body || body.error) {
        throw new SuperTokenAuthorizationError(body?.error || "exchange_failed", body?.error_description || "授权凭证兑换失败");
    }
    return body;
}

function isAuthorizationCallback(value: unknown): value is SuperTokenAuthorizationCallback {
    if (!value || typeof value !== "object") return false;
    const callback = value as Partial<SuperTokenAuthorizationCallback>;
    return callback.type === SUPERTOKEN_AUTHORIZATION_MESSAGE && typeof callback.state === "string";
}

function randomBase64Url(byteLength: number) {
    const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
    return bytesToBase64Url(bytes);
}

export async function superTokenPkceChallenge(value: string) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return bytesToBase64Url(new Uint8Array(digest));
}

function bytesToBase64Url(bytes: Uint8Array) {
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function authorizationErrorMessage(code: string) {
    if (code === "access_denied") return "已取消连接 SuperToken";
    return "SuperToken 授权失败";
}
