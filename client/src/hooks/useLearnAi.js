// ============================================================================
// Learn-AI Brain — TanStack Query hook
// ============================================================================
// Single mutation hook so the palette can drive every tool through one
// surface. We use `useMutation` (not `useQuery`) because each user-typed
// query is a one-shot action; caching the same query across sessions
// would surprise people more than help. The history drawer reads from a
// separate Zustand store, not from the query cache.
// ============================================================================
import { useMutation } from "@tanstack/react-query";
import { learnAiApi } from "@services/learnAi.api";
import { extractErrorMessage, extractErrorCode } from "@services/api";
import { toast } from "@store/useUIStore";
import { useLearnAiPaletteStore } from "@store/useLearnAiPaletteStore";
import { useLearnAiHistoryStore } from "@store/useLearnAiHistoryStore";

const TOOL_TO_API = {
    search_code: learnAiApi.searchCode,
    search_docs: learnAiApi.searchDocs,
    find_similar: learnAiApi.findSimilar,
    explain_symbol: learnAiApi.explainSymbol,
    recent_changes: learnAiApi.recentChanges,
    read_chunk: learnAiApi.readChunk,
    deep_explain: learnAiApi.deepExplain,
};

export function useLearnAiCall() {
    const setDisabled = useLearnAiPaletteStore((s) => s.setDisabled);
    const pushHistory = useLearnAiHistoryStore((s) => s.push);

    return useMutation({
        mutationFn: async ({ tool, args }) => {
            const fn = TOOL_TO_API[tool];
            if (!fn) throw new Error(`Unknown learn-ai tool: ${tool}`);
            const res = await fn(args);
            // Server envelope: { success, data: { tool, result } }
            return { tool, result: res.data?.data?.result, raw: res.data };
        },
        onSuccess: ({ tool }, variables) => {
            pushHistory({ tool, args: variables.args, ts: Date.now() });
        },
        onError: (err) => {
            const code = extractErrorCode(err);
            const msg = extractErrorMessage(err);
            // Disabled / unconfigured = treat as a soft "feature off" — cache
            // the disabled flag in the store so we stop surfacing the palette
            // entry until the page reloads.
            if (code === "LEARN_AI_DISABLED" || code === "LEARN_AI_NOT_CONFIGURED") {
                setDisabled(true);
                toast.error(msg || "Learn-AI brain isn't enabled on this server.");
                return;
            }
            if (code === "MCP_SPAWN_TIMEOUT" || code === "MCP_CALL_TIMEOUT") {
                toast.error(`Brain timed out: ${msg}`);
                return;
            }
            if (code === "MCP_TOOL_ERROR") {
                toast.error(`Tool error: ${msg}`);
                return;
            }
            toast.error(msg || "Learn-AI request failed.");
        },
    });
}
