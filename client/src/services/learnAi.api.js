// ============================================================================
// Learn-AI Brain — API client
// ============================================================================
// One method per MCP tool exposed by the server. Server returns
// `{ success, data: { tool, result } }`; hooks unwrap `data.result`.
// ============================================================================
import api from "./api.js";

export const learnAiApi = {
    searchCode: (body) => api.post("/learn-ai/search-code", body),
    searchDocs: (body) => api.post("/learn-ai/search-docs", body),
    findSimilar: (body) => api.post("/learn-ai/find-similar", body),
    explainSymbol: (body) => api.post("/learn-ai/explain-symbol", body),
    recentChanges: (body) => api.post("/learn-ai/recent-changes", body),
    readChunk: (body) => api.post("/learn-ai/read-chunk", body),
    deepExplain: (body) => api.post("/learn-ai/deep-explain", body),
};
