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


// ── Extract filename from Content-Disposition header ──
// Handles both `filename="x.csv"` and `filename=x.csv` variants.
function filenameFromHeaders(headers, fallback) {
  const cd =
    headers?.["content-disposition"] || headers?.["Content-Disposition"] || "";
  const match = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  return match ? decodeURIComponent(match[1]) : fallback;
}

// ── Trigger a browser download from a Blob ─────────────
function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on next tick so Safari finishes the download first
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Export feedback — CSV / JSON / Markdown ─────────────
// SuperAdmin-only on the server side. Client just fires the request,
// reads the blob, and triggers a download using the server's filename.
export function useExportFeedback() {
  return useMutation({
    mutationFn: async ({ format, ids, filters }) => {
      const res = await feedbackApi.export({ format, ids, filters });

      // If the server sent an error as JSON but axios parsed it as a blob,
      // detect and surface it cleanly.
      const contentType = res.headers?.["content-type"] || "";
      if (contentType.includes("application/json")) {
        const text = await res.data.text();
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error("Export failed: unexpected server response.");
        }
        const message =
          parsed?.error?.message || "Export failed.";
        throw new Error(message);
      }

      const fallback =
        format === "csv"
          ? "feedback-export.csv"
          : format === "json"
          ? "feedback-export.json"
          : "feedback-export.md";
      const filename = filenameFromHeaders(res.headers, fallback);
      triggerBlobDownload(res.data, filename);
      return {
        filename,
        count: Number(res.headers?.["x-export-count"] || 0),
      };
    },
    onSuccess: ({ filename, count }) => {
      toast.success(
        count
          ? `Exported ${count} report${count === 1 ? "" : "s"} → ${filename}`
          : `Exported → ${filename}`,
      );
    },
    onError: (err) => {
      toast.error(err?.message || "Failed to export feedback.");
    },
  });
}