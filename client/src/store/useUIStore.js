/**
 * UI STORE — Zustand
 * Manages UI state: sidebar, theme, modals, toasts.
 * No server data here — only UI concerns.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useUIStore = create(
  persist(
    (set, get) => ({
      // Sidebar
      sidebarCollapsed: false,
      toggleSidebar: () =>
        set((s) => ({
          sidebarCollapsed: !s.sidebarCollapsed,
        })),
      setSidebarCollapsed: (collapsed) =>
        set({
          sidebarCollapsed: collapsed,
        }),

      // Theme
      theme: "dark",
      toggleTheme: () => {
        const newTheme = get().theme === "dark" ? "light" : "dark";
        set({ theme: newTheme });

        const html = document.documentElement;

        if (newTheme === "light") {
          html.classList.remove("dark");
          html.classList.add("light");
        } else {
          html.classList.remove("light");
          html.classList.add("dark");
        }

        localStorage.setItem("ps_theme", newTheme);
      },
      setTheme: (theme) => set({ theme }),

      // Command palette
      commandPaletteOpen: false,
      openCommandPalette: () => set({ commandPaletteOpen: true }),
      closeCommandPalette: () => set({ commandPaletteOpen: false }),
      toggleCommandPalette: () =>
        set((s) => ({
          commandPaletteOpen: !s.commandPaletteOpen,
        })),

      // Toast notifications
      toasts: [],
      addToast: (toast) =>
        set((s) => ({
          toasts: [
            ...s.toasts,
            {
              id: Date.now() + Math.random(),
              type: "info",
              duration: 4000,
              ...toast,
            },
          ],
        })),
      removeToast: (id) =>
        set((s) => ({
          toasts: s.toasts.filter((t) => t.id !== id),
        })),

      // Mobile sidebar
      mobileSidebarOpen: false,
      openMobileSidebar: () => set({ mobileSidebarOpen: true }),
      closeMobileSidebar: () => set({ mobileSidebarOpen: false }),

      // ── Recently visited routes ───────────────────────────
      // Most recent first. Capped at 10 entries; the sidebar
      // surfaces the top 3 that match a known nav item (deep
      // routes without a sidebar match are kept here but not
      // shown — they may match a future nav item).
      recentPaths: [],
      pushRecentPath: (path) =>
        set((s) => {
          if (typeof path !== "string" || !path.startsWith("/")) return s;
          const existing = s.recentPaths.filter((p) => p !== path);
          return { recentPaths: [path, ...existing].slice(0, 10) };
        }),
      clearRecentPaths: () => set({ recentPaths: [] }),
    }),
    {
      name: "ps_ui",
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
        recentPaths: state.recentPaths,
      }),

      onRehydrateStorage: () => (state) => {
        if (state) {
          state.toasts = [];
          state.mobileSidebarOpen = false;
          state.commandPaletteOpen = false;
        }
      },
    },
  ),
);

// Convenience toast helpers — use these in components
export const toast = {
  success: (message, title) =>
    useUIStore.getState().addToast({ type: "success", message, title }),
  error: (message, title) =>
    useUIStore
      .getState()
      .addToast({ type: "error", message, title, duration: 6000 }),
  warning: (message, title) =>
    useUIStore
      .getState()
      .addToast({ type: "warning", message, title, duration: 5000 }),
  info: (message, title) =>
    useUIStore.getState().addToast({ type: "info", message, title }),
};
