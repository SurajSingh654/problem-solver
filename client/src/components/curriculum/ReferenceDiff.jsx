import { Suspense, lazy, useEffect, useState } from "react";
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

// Below this width, side-by-side diff shrinks each pane to ~250px which
// truncates all but the shortest lines. Flip to inline mode so the reader
// keeps full line width — Monaco's inline diff shows deletions as red
// gutter blocks above insertions.
const SIDE_BY_SIDE_MIN_WIDTH = 600;

export default function ReferenceDiff({
  language = "JAVA",
  userCode,
  referenceCode,
}) {
  const theme = useUIStore((s) => s.theme);

  // Responsive side-by-side toggle. Matches Monaco's own breakpoint — a
  // narrower viewport shows inline diff so lines aren't truncated. We use
  // window.matchMedia rather than a resize listener to avoid a re-render
  // on every pixel of a drag.
  const [sideBySide, setSideBySide] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia(`(min-width: ${SIDE_BY_SIDE_MIN_WIDTH}px)`).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(min-width: ${SIDE_BY_SIDE_MIN_WIDTH}px)`);
    const onChange = (e) => setSideBySide(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <div className="h-full rounded-md border border-border-default overflow-hidden">
      <Suspense
        fallback={
          <div className="p-4 text-sm text-text-tertiary">
            Loading diff…
          </div>
        }
      >
        <DiffEditor
          height="100%"
          language={LANG_MAP[language] ?? "plaintext"}
          original={userCode ?? ""}
          modified={referenceCode ?? ""}
          theme={theme === "dark" ? "vs-dark" : "vs"}
          options={{
            renderSideBySide: sideBySide,
            minimap: { enabled: false },
            readOnly: true,
            fontSize: 13,
          }}
        />
      </Suspense>
    </div>
  );
}
