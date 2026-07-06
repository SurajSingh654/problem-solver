import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ESM-native equivalent of CommonJS __dirname.
// package.json has "type": "module", so __dirname does not exist.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],

  // Path aliases — import from '@/components/...' instead of '../../'
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@components": path.resolve(__dirname, "./src/components"),
      "@pages": path.resolve(__dirname, "./src/pages"),
      "@hooks": path.resolve(__dirname, "./src/hooks"),
      "@store": path.resolve(__dirname, "./src/store"),
      "@services": path.resolve(__dirname, "./src/services"),
      "@utils": path.resolve(__dirname, "./src/utils"),
      "@styles": path.resolve(__dirname, "./src/styles"),
      "@features": path.resolve(__dirname, "./src/features"),
    },
  },

  // Dev server
  server: {
    port: 5173,
    strictPort: true,
    // Proxy API calls to Express — avoids CORS in development
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false,
      },
    },
  },

  // Preview (production build preview)
  preview: {
    port: 4173,
  },

  // Build
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        // Split vendor chunks for better caching
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          query: ["@tanstack/react-query"],
          ui: ["framer-motion", "lucide-react"],
          charts: ["recharts"],
          forms: ["react-hook-form", "@hookform/resolvers", "zod"],
          highlight: ["highlight.js"],
          excalidraw: ["@excalidraw/excalidraw"],
          mdEditor: ["@uiw/react-md-editor"],
          monaco: ["@monaco-editor/react", "monaco-editor"],
          // W3.T8 + W3.T9 — curriculum admin (TEAM_ADMIN). Bundled together
          // because every page depends on the same hook file + the shared
          // @components/curriculum primitives; splitting them further would
          // dedupe the shared subset into a common chunk anyway. Reviewers
          // typically move between the landing page, template browser, and
          // topic authoring page in a single session so pre-fetching them
          // together is fine.
          curriculumAdmin: [
            "/src/pages/team-admin/curriculum/CurriculumAdminPage.jsx",
            "/src/pages/team-admin/curriculum/TemplateBrowserPage.jsx",
            "/src/pages/team-admin/curriculum/TopicAuthoringPage.jsx",
            "/src/pages/team-admin/curriculum/TopicMetadataTab.jsx",
            "/src/pages/team-admin/curriculum/ConceptsListTab.jsx",
            "/src/pages/team-admin/curriculum/CurriculumReviewTab.jsx",
            "/src/pages/team-admin/curriculum/PublishTab.jsx",
          ],
        },
      },
    },
  },
});
