import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { designStudioApi } from "@services/designStudio.api";
import { toast } from "@store/useUIStore";

const QUERY_KEYS = {
  SESSIONS: (params) => ["design-studio", "sessions", params],
  SESSION: (id) => ["design-studio", "session", id],
};

// ── Create a new design session ───────────────────────────
export function useCreateDesignSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => designStudioApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["design-studio"] });
      toast.success("Design session created.");
    },
    onError: (err) => {
      toast.error(
        err?.response?.data?.error?.message || "Failed to create session.",
      );
    },
  });
}

// ── List user's design sessions ───────────────────────────
export function useDesignSessions(params = {}) {
  return useQuery({
    queryKey: QUERY_KEYS.SESSIONS(params),
    queryFn: () => designStudioApi.list(params).then((r) => r.data.data),
    staleTime: 1000 * 60,
  });
}

// ── Get a single session with full data ───────────────────
export function useDesignSession(sessionId) {
  return useQuery({
    queryKey: QUERY_KEYS.SESSION(sessionId),
    queryFn: () =>
      designStudioApi.get(sessionId).then((r) => r.data.data.session),
    enabled: !!sessionId,
    staleTime: 1000 * 30,
  });
}

// ── Delete a session ──────────────────────────────────────
export function useDeleteDesignSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId) => designStudioApi.delete(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["design-studio"] });
      toast.success("Session deleted.");
    },
    onError: (err) => {
      toast.error(
        err?.response?.data?.error?.message || "Failed to delete session.",
      );
    },
  });
}

// ── Save phase content (debounced auto-save) ──────────────
export function useSavePhase() {
  return useMutation({
    mutationFn: ({ sessionId, phaseId, content }) =>
      designStudioApi.savePhase(sessionId, { phaseId, content }),
    // No toast on success — this fires on every keystroke/blur
    onError: (err) => {
      console.error("[DesignStudio] Phase save failed:", err.message);
    },
  });
}

// ── Save diagram data ─────────────────────────────────────
export function useSaveDiagram() {
  return useMutation({
    mutationFn: ({
      sessionId,
      diagramData,
      componentAnnotations,
      dataFlowDescription,
    }) =>
      designStudioApi.saveDiagram(sessionId, {
        diagramData,
        componentAnnotations,
        dataFlowDescription,
      }),
    onError: (err) => {
      console.error("[DesignStudio] Diagram save failed:", err.message);
    },
  });
}

// ── Update timing ─────────────────────────────────────────
export function useUpdateTiming() {
  return useMutation({
    mutationFn: ({ sessionId, totalTimeSpent, phaseTimings, currentPhase }) => {
      const body = { totalTimeSpent };
      if (phaseTimings) body.phaseTimings = phaseTimings;
      if (typeof currentPhase === "number") body.currentPhase = currentPhase;
      return designStudioApi.updateTiming(sessionId, body);
    },
    onError: (err) => {
      console.error("[DesignStudio] Timing update failed:", err.message);
    },
  });
}

// ── Update session status ─────────────────────────────────
export function useUpdateSessionStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId, status }) =>
      designStudioApi.updateStatus(sessionId, { status }),
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.SESSION(sessionId),
      });
    },
    onError: (err) => {
      toast.error(
        err?.response?.data?.error?.message || "Failed to update status.",
      );
    },
  });
}

// ── AI Coaching (validate / guide / teach) ────────────────
export function useAICoach() {
  return useMutation({
    mutationFn: ({ sessionId, mode, phaseId, userQuery }) =>
      designStudioApi.askCoach(sessionId, { mode, phaseId, userQuery }),
    onError: (err) => {
      const message = err?.response?.data?.error?.message || err?.message || "";
      if (message.includes("rate") || message.includes("limit")) {
        toast.error("AI rate limit reached. Wait a moment and try again.");
      } else {
        toast.error("AI coaching failed. Try again.");
      }
    },
  });
}

// ── Generate validation scenarios ─────────────────────────
export function useGenerateScenarios() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId) => designStudioApi.generateScenarios(sessionId),
    onSuccess: (_, sessionId) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.SESSION(sessionId),
      });
      toast.success("Scenarios generated — test your design!");
    },
    onError: (err) => {
      const message = err?.response?.data?.error?.message || "";
      if (message.includes("at least 3")) {
        toast.error(
          "Complete at least 3 design phases before generating scenarios.",
        );
      } else if (message.includes("rate") || message.includes("limit")) {
        toast.error("AI rate limit reached. Wait a moment and try again.");
      } else {
        toast.error("Failed to generate scenarios.");
      }
    },
  });
}

// ── Submit scenario response ──────────────────────────────
export function useSubmitScenarioResponse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId, scenarioId, response }) =>
      designStudioApi.submitScenarioResponse(sessionId, scenarioId, {
        response,
      }),
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.SESSION(sessionId),
      });
    },
    onError: (err) => {
      toast.error(
        err?.response?.data?.error?.message || "Failed to save response.",
      );
    },
  });
}

// ── Evaluate a scenario response ──────────────────────────
export function useEvaluateScenario() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId, scenarioId }) =>
      designStudioApi.evaluateScenario(sessionId, scenarioId),
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.SESSION(sessionId),
      });
    },
    onError: (err) => {
      const message = err?.response?.data?.error?.message || "";
      if (message.includes("rate") || message.includes("limit")) {
        toast.error("AI rate limit reached. Wait a moment and try again.");
      } else {
        toast.error("Failed to evaluate scenario.");
      }
    },
  });
}

// ── Save flow simulation ──────────────────────────────────
export function useSaveFlowSimulation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId, flowName, hops }) =>
      designStudioApi.saveFlow(sessionId, { flowName, hops }),
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.SESSION(sessionId),
      });
      toast.success("Flow simulation saved.");
    },
    onError: (err) => {
      toast.error(
        err?.response?.data?.error?.message || "Failed to save flow.",
      );
    },
  });
}

// ── Save scale analysis ───────────────────────────────────
export function useSaveScaleAnalysis() {
  return useMutation({
    mutationFn: ({ sessionId, current, tenX, hundredX, failureAtScale }) =>
      designStudioApi.saveScaleAnalysis(sessionId, {
        current,
        tenX,
        hundredX,
        failureAtScale,
      }),
    onSuccess: () => {
      toast.success("Scale analysis saved.");
    },
    onError: (err) => {
      toast.error(
        err?.response?.data?.error?.message || "Failed to save scale analysis.",
      );
    },
  });
}

// ── Request final comprehensive evaluation ────────────────
export function useRequestEvaluation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId) => designStudioApi.requestEvaluation(sessionId),
    onSuccess: (_, sessionId) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.SESSION(sessionId),
      });
      toast.success("Evaluation complete — review your results!");
    },
    onError: (err) => {
      const message = err?.response?.data?.error?.message || "";
      if (message.includes("rate") || message.includes("limit")) {
        toast.error("AI rate limit reached. Wait a moment and try again.");
      } else if (
        message.includes("not ready") ||
        message.includes("Complete the design")
      ) {
        toast.error("Complete design phases and generate scenarios first.");
      } else {
        toast.error("Failed to generate evaluation.");
      }
    },
  });
}
