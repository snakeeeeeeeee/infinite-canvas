import { Input } from "antd";
import { useTranslation } from "react-i18next";

import { limitPromptInput, PROMPT_CHARACTER_LIMIT, promptCharacterCount, promptReachedLimit } from "@/lib/prompt-limit";
import { cn } from "@/lib/utils";

type PromptTextAreaProps = {
    value: string;
    onChange: (value: string) => void;
    rows?: number;
    placeholder?: string;
    status?: "error";
};

export function PromptTextArea({ value, onChange, rows, placeholder, status }: PromptTextAreaProps) {
    const atLimit = promptReachedLimit(value);
    const invalid = atLimit || status === "error";
    return (
        <div className={cn("overflow-hidden rounded-md border transition-colors", invalid ? "border-red-500 ring-2 ring-red-500/10" : "border-stone-300 focus-within:border-stone-500 dark:border-stone-700 dark:focus-within:border-stone-500")}>
            <Input.TextArea value={value} variant="borderless" rows={rows} placeholder={placeholder} className="!rounded-none" onChange={(event) => onChange(limitPromptInput(event.target.value, value, (event.nativeEvent as InputEvent).inputType))} />
            <PromptLimitStatus value={value} />
        </div>
    );
}

export function PromptLimitStatus({ value, className }: { value: string; className?: string }) {
    const { t } = useTranslation();
    const count = promptCharacterCount(value);
    const atLimit = count >= PROMPT_CHARACTER_LIMIT;
    return (
        <div className={cn("flex h-8 items-center justify-between gap-3 border-t px-3 text-xs transition-colors", atLimit ? "border-red-500/20 bg-red-50/70 text-red-600 dark:bg-red-950/20 dark:text-red-300" : "border-black/[0.07] text-black/40 dark:border-white/[0.07] dark:text-white/40", className)}>
            <span>{atLimit ? t("promptLimit.reached", { limit: PROMPT_CHARACTER_LIMIT }) : ""}</span>
            <span className="shrink-0 tabular-nums">{count} / {PROMPT_CHARACTER_LIMIT}</span>
        </div>
    );
}
