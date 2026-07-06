import { Suspense, lazy } from "react";
import { useUIStore } from "@store/useUIStore";

// Lazy-load — DiffEditor is a named export of @monaco-editor/react; Vite
// code-splits it into the same `monaco` chunk as MonacoLabEditor (see
// vite.config.js manualChunks). No new dependency footprint.
const DiffEditor = lazy(() =>
  import("@monaco-editor/react").then((m) => ({ default: m.DiffEditor })),
);

const LANG_MAP = {
  JAVA: "java",
  PYTHON: "python",
  TYPESCRIPT: "typescript",
  JAVASCRIPT: "javascript",
  GO: "go",
  CPP: "cpp",
  CSHARP: "csharp",
};

export default function ReferenceDiff({
  language = "JAVA",
  userCode,
  referenceCode,
}) {
  const theme = useUIStore((s) => s.theme);

  return (
    <div className="h-[520px] rounded-md border border-border-default overflow-hidden">
      <Suspense
        fallback={
          <div className="p-4 text-sm text-text-tertiary">
            Loading diff…
          </div>
        }
      >
        <DiffEditor
          height="520px"
          language={LANG_MAP[language] ?? "plaintext"}
          original={userCode ?? ""}
          modified={referenceCode ?? ""}
          theme={theme === "dark" ? "vs-dark" : "vs"}
          options={{
            renderSideBySide: true,
            minimap: { enabled: false },
            readOnly: true,
            fontSize: 13,
          }}
        />
      </Suspense>
    </div>
  );
}
