// ============================================================================
// Learn-AI palette — open/close state + a runtime "server says it's off" flag.
// ============================================================================
// Not persisted: the disabled flag should reset on page reload so a server
// that comes back online recovers without the user clearing localStorage.
// ============================================================================
import { create } from "zustand";

export const useLearnAiPaletteStore = create((set) => ({
    isOpen: false,
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
    toggle: () => set((s) => ({ isOpen: !s.isOpen })),

    // Set to true on the first 503 LEARN_AI_DISABLED / _NOT_CONFIGURED.
    // The Topbar trigger and Cmd+Shift+K listener consult this flag and
    // short-circuit if the server has told us the feature is off.
    serverDisabled: false,
    setDisabled: (value) => set({ serverDisabled: Boolean(value) }),
}));
