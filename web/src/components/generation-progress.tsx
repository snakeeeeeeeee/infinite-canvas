import { motion, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useEffect } from "react";

type GenerationProgressProps = {
    progress?: number;
    progressKnown?: boolean;
    label: string;
    className?: string;
    compact?: boolean;
    accentColor?: string;
    surfaceColor?: string;
    mutedColor?: string;
};

export function GenerationProgress({
    progress = 0,
    progressKnown = false,
    label,
    className = "",
    compact = false,
    accentColor,
    surfaceColor,
    mutedColor,
}: GenerationProgressProps) {
    const reduceMotion = useReducedMotion();
    const target = progressKnown ? Math.min(100, Math.max(0, progress)) : 0;
    const spring = useSpring(target, reduceMotion ? { duration: 0 } : { stiffness: 52, damping: 18, mass: 0.7 });
    const progressText = useTransform(spring, (value) => `${Math.round(value)}%`);
    const revealClip = useTransform(spring, (value) => `inset(${100 - value}% 0 0 0)`);
    const lineScale = useTransform(spring, (value) => value / 100);

    useEffect(() => {
        spring.set(target);
    }, [spring, target]);

    return (
        <div
            className={`relative isolate h-full w-full overflow-hidden ${className}`}
            style={{ ...(accentColor ? { color: accentColor } : {}), ...(surfaceColor ? { backgroundColor: surfaceColor } : {}) }}
            role="status"
            aria-label={progressKnown ? `${label} ${Math.round(target)}%` : label}
        >
            <div
                className="absolute inset-0 opacity-50"
                style={{
                    backgroundImage: "radial-gradient(circle, color-mix(in srgb, currentColor 20%, transparent) 1px, transparent 1.25px)",
                    backgroundSize: compact ? "12px 12px" : "16px 16px",
                }}
            />
            {progressKnown ? <motion.div className="absolute inset-0 origin-bottom bg-current opacity-[0.07]" style={{ clipPath: revealClip }} /> : null}
            <motion.div
                className="absolute inset-x-[-18%] h-[32%] opacity-30"
                style={{ background: "linear-gradient(180deg, transparent, color-mix(in srgb, currentColor 24%, transparent), transparent)" }}
                animate={reduceMotion ? { top: "36%" } : { top: ["-34%", "104%"] }}
                transition={reduceMotion ? undefined : { duration: 3.8, ease: "linear", repeat: Infinity }}
            />
            <div className={`absolute inset-0 flex flex-col items-center justify-center ${compact ? "gap-1" : "gap-2"}`}>
                {progressKnown ? <motion.span className={compact ? "text-xl font-medium tabular-nums" : "text-3xl font-medium tabular-nums"}>{progressText}</motion.span> : <span className={compact ? "text-xs font-medium" : "text-sm font-medium"}>{label}</span>}
                {progressKnown ? <span className={`${compact ? "text-[10px]" : "text-xs"} opacity-65`} style={mutedColor ? { color: mutedColor } : undefined}>{label}</span> : null}
            </div>
            <div className="absolute inset-x-0 bottom-0 h-px overflow-hidden bg-current opacity-30">
                {progressKnown ? (
                    <motion.div className="h-full origin-left bg-current" style={{ scaleX: lineScale }} />
                ) : (
                    <motion.div
                        className="h-full w-1/3 bg-current"
                        animate={reduceMotion ? { x: "100%" } : { x: ["-100%", "400%"] }}
                        transition={reduceMotion ? undefined : { duration: 1.8, ease: "easeInOut", repeat: Infinity }}
                    />
                )}
            </div>
        </div>
    );
}
