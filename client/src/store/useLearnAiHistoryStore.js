// ============================================================================
// Learn-AI palette — last-10 query history (per browser, persisted).
// ============================================================================
import { create } from "zustand";
import { persist } from "zustand/middleware";

const HISTORY_LIMIT = 10;

export const useLearnAiHistoryStore = create(
    persist(
        (set) => ({
            entries: [],
            push: (entry) =>
                set((s) => {
                    // Drop duplicates (same tool + same JSON args) so re-running
                    // a query doesn't push the list around.
                    const key = JSON.stringify({ t: entry.tool, a: entry.args });
                    const filtered = s.entries.filter(
                        (e) => JSON.stringify({ t: e.tool, a: e.args }) !== key,
                    );
                    return {
                        entries: [entry, ...filtered].slice(0, HISTORY_LIMIT),
                    };
                }),
            clear: () => set({ entries: [] }),
        }),
        {
            name: "ps_learn_ai_history",
            partialize: (state) => ({ entries: state.entries }),
        },
    ),
);
