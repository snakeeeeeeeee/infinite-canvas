export const PROMPT_CHARACTER_LIMIT = 2000;

export function promptCharacterCount(value: string) {
    return Array.from(value).length;
}

export function limitPromptText(value: string) {
    if (value.length <= PROMPT_CHARACTER_LIMIT) return value;
    const characters = Array.from(value);
    return characters.length > PROMPT_CHARACTER_LIMIT ? characters.slice(0, PROMPT_CHARACTER_LIMIT).join("") : value;
}

export function limitPromptInput(next: string, current: string, inputType = "") {
    if (inputType === "insertFromPaste" || inputType === "insertFromDrop") return limitPromptText(next);
    if (promptReachedLimit(current) && promptCharacterCount(next) > PROMPT_CHARACTER_LIMIT) return current;
    return limitPromptText(next);
}

export function promptReachedLimit(value: string) {
    return promptCharacterCount(value) >= PROMPT_CHARACTER_LIMIT;
}
