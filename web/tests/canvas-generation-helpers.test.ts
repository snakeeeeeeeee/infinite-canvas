import { describe, expect, test } from "bun:test";

if (!("localStorage" in globalThis)) {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
        value: {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => values.set(key, value),
            removeItem: (key: string) => values.delete(key),
            clear: () => values.clear(),
            key: (index: number) => Array.from(values.keys())[index] ?? null,
            get length() {
                return values.size;
            },
        } satisfies Storage,
    });
}

const { resetInterruptedGeneration } = await import("../src/lib/canvas/canvas-generation-helpers");
const { CanvasNodeType } = await import("../src/types/canvas");

describe("Canvas async image recovery", () => {
    test("keeps every target of a durable native batch in loading state", () => {
        const nodes = [
            { id: "root", type: CanvasNodeType.Image, title: "root", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { status: "loading" as const, isBatchRoot: true } },
            { id: "image-1", type: CanvasNodeType.Image, title: "1", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { status: "loading" as const, batchRootId: "root", asyncTaskId: "task-1", asyncOriginNodeId: "origin", asyncResultNodeIds: ["image-1", "image-2"] } },
            { id: "image-2", type: CanvasNodeType.Image, title: "2", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { status: "loading" as const, batchRootId: "root" } },
            { id: "origin", type: CanvasNodeType.Config, title: "origin", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { status: "loading" as const } },
            { id: "orphan", type: CanvasNodeType.Image, title: "orphan", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { status: "loading" as const } },
        ];

        const restored = resetInterruptedGeneration(nodes);
        expect(restored.find((node) => node.id === "root")?.metadata?.status).toBe("loading");
        expect(restored.find((node) => node.id === "image-1")?.metadata?.status).toBe("loading");
        expect(restored.find((node) => node.id === "image-2")?.metadata?.status).toBe("loading");
        expect(restored.find((node) => node.id === "origin")?.metadata?.status).toBe("loading");
        expect(restored.find((node) => node.id === "orphan")?.metadata?.status).toBe("error");
    });
});
