import { describe, expect, test } from "bun:test";

import { readRuntimeConfig } from "../src/constant/runtime-config";

describe("Docker runtime configuration", () => {
    test("prefers the container runtime value over the Vite build value", () => {
        expect(readRuntimeConfig("SUPERTOKEN_BASE_URL", "https://build.example", "", { SUPERTOKEN_BASE_URL: "  https://supertoken.cc/  " })).toBe("https://supertoken.cc/");
        expect(readRuntimeConfig("SUPERTOKEN_AUTH_BASE_URL", "https://auth-build.example", "", { SUPERTOKEN_AUTH_BASE_URL: "  https://auth-runtime.example/  " })).toBe("https://auth-runtime.example/");
    });

    test("falls back to the Vite value and then the default", () => {
        expect(readRuntimeConfig("SUPERTOKEN_BASE_URL", " https://build.example ", "", {})).toBe("https://build.example");
        expect(readRuntimeConfig("SUPERTOKEN_BASE_URL", undefined, "https://fallback.example", {})).toBe("https://fallback.example");
        expect(readRuntimeConfig("SUPERTOKEN_AUTH_BASE_URL", undefined, "https://supertoken.cc", {})).toBe("https://supertoken.cc");
    });
});
