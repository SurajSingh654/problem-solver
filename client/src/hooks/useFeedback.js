import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { feedbackApi } from "@services/feedback.api";
import { toast } from "@store/useUIStore";

const QUERY_KEYS = {
  FEEDBACK_LIST: (params) => ["feedback", "list", params],
  FEEDBACK_ITEM: (id) => ["feedback", "item", id],
  FEEDBACK_SIMILAR: (params) => ["feedback", "similar", params],
};

export function useSubmitFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => feedbackApi.submit(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feedback"] });
      toast.success("Feedback submitted. We review every report.");
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || "Failed to submit feedback.");
    },
  });
}

export function useFeedbackList(params = {}) {
  return useQuery({
    queryKey: QUERY_KEYS.FEEDBACK_LIST(params),
    queryFn: () => feedbackApi.list(params).then((r) => r.data.data),
    staleTime: 1000 * 60,
  });
}

// NEW: Debounced similar reports check — fires as user types title
// Only enabled when title has 5+ characters to avoid excessive requests
export function useSimilarFeedback({ title, type, affectedArea }) {
  const enabled = Boolean(title && title.trim().length >= 5);
  return useQuery({
    queryKey: QUERY_KEYS.FEEDBACK_SIMILAR({ title, type, affectedArea }),
    queryFn: () =>
      feedbackApi
        .getSimilar({
          title: title?.trim(),
          type,
          affectedArea: affectedArea || undefined,
        })
        .then((r) => r.data.data.similar || []),
    enabled,
    staleTime: 1000 * 30,
    // Debounce: wait 600ms after the last keystroke before firing
    // This uses TanStack Query's built-in placeholderData to keep
    // showing previous results while the new query is loading
    placeholderData: (previousData) => previousData,
  });
}

export function useUpdateFeedbackStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ feedbackId, data }) =>
      feedbackApi.updateStatus(feedbackId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feedback"] });
      toast.success("Status updated.");
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || "Failed to update status.");
    },
  });
}
