import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { parseSuperTokenAuthorizationCallback } from "@/services/api/supertoken-authorization";

export default function SuperTokenAuthCallbackPage() {
    const [hasOpener] = useState(() => Boolean(window.opener && !window.opener.closed));

    useEffect(() => {
        if (!window.opener || window.opener.closed) return;
        window.opener.postMessage(parseSuperTokenAuthorizationCallback(window.location.search), window.location.origin);
        const timer = window.setTimeout(() => window.close(), 120);
        return () => window.clearTimeout(timer);
    }, []);

    return (
        <main className="flex min-h-screen items-center justify-center bg-stone-50 px-5 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
            <div className="text-center">
                <LoaderCircle className="mx-auto size-6 animate-spin text-emerald-600 dark:text-emerald-400" />
                <div className="mt-4 text-sm font-medium">{hasOpener ? "正在完成 SuperToken 连接" : "授权窗口已失效"}</div>
                <div className="mt-1 text-xs text-stone-500">{hasOpener ? "此窗口将自动关闭" : "请返回 Infinite Canvas 重新连接"}</div>
            </div>
        </main>
    );
}
