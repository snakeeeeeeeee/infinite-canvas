import { useEffect } from "react";

import { nextSuperTokenModelSyncDelay, syncDueSuperTokenModels } from "@/services/api/supertoken-model-sync";
import { useConfigStore } from "@/stores/use-config-store";

const HIDDEN_RECHECK_MS = 60_000;

export function useSuperTokenModelSync() {
    useEffect(() => {
        let disposed = false;
        let timer = 0;
        let running = false;

        const schedule = (delay?: number) => {
            window.clearTimeout(timer);
            if (disposed) return;
            const nextDelay = delay ?? nextSuperTokenModelSyncDelay(useConfigStore.getState().config.channels);
            timer = window.setTimeout(() => void tick(), Math.max(1_000, nextDelay));
        };
        const tick = async () => {
            if (disposed || running) return;
            if (document.visibilityState === "hidden") {
                schedule(HIDDEN_RECHECK_MS);
                return;
            }
            running = true;
            try {
                await syncDueSuperTokenModels();
            } catch {
                // Background synchronization must not interrupt the active workspace.
            } finally {
                running = false;
                schedule();
            }
        };
        const onVisibilityChange = () => {
            if (document.visibilityState === "visible") void tick();
        };
        const unsubscribe = useConfigStore.subscribe((state, previous) => {
            if (state.config.channels !== previous.config.channels) schedule(1_000);
        });
        document.addEventListener("visibilitychange", onVisibilityChange);
        void tick();
        return () => {
            disposed = true;
            unsubscribe();
            window.clearTimeout(timer);
            document.removeEventListener("visibilitychange", onVisibilityChange);
        };
    }, []);
}
