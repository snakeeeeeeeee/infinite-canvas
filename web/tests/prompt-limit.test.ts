import { describe, expect, test } from "bun:test";

const { limitPromptInput, limitPromptText, PROMPT_CHARACTER_LIMIT, promptCharacterCount, promptReachedLimit } = await import("../src/lib/prompt-limit");

describe("prompt character limit", () => {
    test("counts Chinese, Latin, punctuation, and whitespace as characters", () => {
        expect(promptCharacterCount("中文 A!\n")).toBe(6);
    });

    test("keeps text within 2000 characters and truncates overflow", () => {
        const exact = "图".repeat(PROMPT_CHARACTER_LIMIT);
        expect(limitPromptText(exact)).toBe(exact);
        expect(promptReachedLimit(exact)).toBe(true);
        expect(promptCharacterCount(limitPromptText(`${exact}多余内容`))).toBe(PROMPT_CHARACTER_LIMIT);
    });

    test("does not split a surrogate-pair emoji while truncating", () => {
        const limited = limitPromptText("🙂".repeat(PROMPT_CHARACTER_LIMIT + 1));
        expect(promptCharacterCount(limited)).toBe(PROMPT_CHARACTER_LIMIT);
        expect(limited.endsWith("🙂")).toBe(true);
    });

    test("blocks additions at the limit while allowing deletion and replacement", () => {
        const exact = "a".repeat(PROMPT_CHARACTER_LIMIT);
        expect(limitPromptInput(`b${exact}`, exact)).toBe(exact);
        expect(limitPromptInput(exact.slice(1), exact)).toBe(exact.slice(1));
        expect(limitPromptInput(`b${exact.slice(1)}`, exact)).toBe(`b${exact.slice(1)}`);
        expect(limitPromptInput("b".repeat(PROMPT_CHARACTER_LIMIT + 1), exact, "insertFromPaste")).toBe("b".repeat(PROMPT_CHARACTER_LIMIT));
    });
});
