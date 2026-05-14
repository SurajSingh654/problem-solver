// ============================================================================
// SuperAdmin Diagnostics — TanStack Query hook
// ============================================================================
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { diagnosticsApi } from "@services/diagnostics.api";

const KEY = ["super-admin", "diagnostics"];

export function useDiagnostics() {
    return useQuery({
        queryKey: KEY,
        queryFn: () => diagnosticsApi.get().then((r) => r.data.data),
        // Diagnostics are inherently a snapshot; don't auto-refresh on
        // focus or interval. The dashboard has an explicit "Refresh"
        // button so the user controls the cost.
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
    });
}

export function useRefetchDiagnostics() {
    const qc = useQueryClient();
    return () => qc.invalidateQueries({ queryKey: KEY });
}
