import { Suspense, lazy, useCallback, useEffect, useMemo, useRef } from "react";
import { useUIStore } from "@store/useUIStore";

// Lazy-load — @monaco-editor/react + monaco-editor together weigh ~2 MB
// gzipped. The `monaco` entry in vite.config.js isolates them in their own
// chunk so the critical bundle stays lean.
const Editor = lazy(() => import("@monaco-editor/react"));

const AUTOSAVE_DEBOUNCE_MS = 5000;
const MAX_CHARS = 100_000;
const LANG_MAP = {
  JAVA: "java",
  PYTHON: "python",
  TYPESCRIPT: "typescript",
  JAVASCRIPT: "javascript",
  GO: "go",
  CPP: "cpp",
  CSHARP: "csharp",
};

export default function MonacoLabEditor({
  labId,
  language = "JAVA",
  starterCode = "",
  value,
  onChange,
  disabled = false,
}) {
  const theme = useUIStore((s) => s.theme);
  const autosaveKey = useMemo(
    () => `curriculum:lab:draft:${labId}`,
    [labId],
  );
  const debounceRef = useRef();

  const scheduleAutosave = useCallback(
    (next) => {
      if (typeof window === "undefined") return;
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        try {
          window.localStorage.setItem(autosaveKey, next);
        } catch {
          // Storage quota — silent drop; draft is not source of truth.
        }
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [autosaveKey],
  );

  const handleChange = useCallback(
    (next) => {
      const clamped = (next ?? "").slice(0, MAX_CHARS);
      onChange?.(clamped);
      scheduleAutosave(clamped);
    },
    [onChange, scheduleAutosave],
  );

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  return (
    <div className="h-[420px] rounded-md border border-border-default overflow-hidden">
      <Suspense
        fallback={
          <div className="p-4 text-sm text-text-tertiary">
            Loading editor…
          </div>
        }
      >
        <Editor
          height="420px"
          language={LANG_MAP[language] ?? "plaintext"}
          value={value ?? starterCode}
          onChange={handleChange}
          theme={theme === "dark" ? "vs-dark" : "vs"}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            readOnly: disabled,
            // Monaco captures Tab as indent by default, which traps
            // keyboard-only users in the editor. `tabFocusMode: true`
            // makes Tab move focus out of the editor; Ctrl/Cmd+M toggles
            // back to indent mode when they actually want to indent.
            tabFocusMode: true,
          }}
        />
      </Suspense>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function loadDraft(labId) {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(`curriculum:lab:draft:${labId}`);
  } catch {
    return null;
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export function clearDraft(labId) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`curriculum:lab:draft:${labId}`);
  } catch {
    /* no-op */
  }
}

// Called from the auth store's logout — prevents a shared-workstation draft
// leak where the next user opens the same lab URL and sees the prior user's
// in-progress code.
// eslint-disable-next-line react-refresh/only-export-components
export function clearAllLabDrafts() {
  if (typeof window === "undefined") return;
  try {
    const doomed = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith("curriculum:lab:draft:")) doomed.push(key);
    }
    doomed.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* no-op */
  }
}
