// ============================================================================
// MCP tokens — TanStack Query hooks (Phase MCP-4-UI)
// ============================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { mcpTokensApi } from "@services/mcpTokens.api";
import { toast } from "@store/useUIStore";

const KEYS = {
    LIST: ["mcp-tokens", "list"],
};

function pickError(err, fallback) {
    return (
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        fallback
    );
}

export function useMcpTokens() {
    return useQuery({
        queryKey: KEYS.LIST,
        queryFn: () => mcpTokensApi.list().then((r) => r.data.data.tokens),
        staleTime: 1000 * 30,
    });
}

// Returns the full create response (including the one-time JWT) so the
// caller can show it in the create modal. We do NOT cache the token.
export function useCreateMcpToken() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data) =>
            mcpTokensApi.create(data).then((r) => r.data.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["mcp-tokens"] });
        },
        onError: (err) =>
            toast.error(pickError(err, "Failed to create MCP token.")),
    });
}

export function useRevokeMcpToken() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (jti) => mcpTokensApi.revoke(jti).then((r) => r.data.data),
        onSuccess: (data) => {
            qc.invalidateQueries({ queryKey: ["mcp-tokens"] });
            if (data?.alreadyRevoked) {
                toast.success("Token was already revoked.");
            } else {
                toast.success("Token revoked.");
            }
        },
        onError: (err) =>
            toast.error(pickError(err, "Failed to revoke token.")),
    });
}
