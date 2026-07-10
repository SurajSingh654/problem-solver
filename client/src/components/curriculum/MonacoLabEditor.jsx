import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleDot, Loader2 } from "lucide-react";
import { useUIStore } from "@store/useUIStore";
import { cn } from "@utils/cn";

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

// Autosave status pill — the editor previously wrote to localStorage every
// 5s in silence, so users didn't know their work was safe. Now surfaces
// three states: "Unsaved" (dirty, debounce still pending), "Saving…"
// (debounce fired, localStorage.setItem in progress), "Saved <t>" (last
// successful write, with a rolling relative timestamp). The visual weight
// is deliberately low — chip in the top-right of the editor frame, not a
// full toast.
function AutosaveIndicator({ status, savedAt }) {
  // `now` re-renders every 30s so "Saved 5s ago" doesn't stay frozen
  // as "5s ago" for an hour. Real state (not a bare tick) so eslint's
  // exhaustive-deps sees a legitimate value flow into the label memo.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (status !== "saved" || !savedAt) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [status, savedAt]);

  const label = useMemo(() => {
    if (status === "dirty") return "Unsaved changes";
    if (status === "saving") return "Saving…";
    if (status === "saved" && savedAt) {
      const secs = Math.max(0, Math.floor((now - savedAt) / 1000));
      if (secs < 5) return "Saved just now";
      if (secs < 60) return `Saved ${secs}s ago`;
      const mins = Math.floor(secs / 60);
      if (mins < 60) return `Saved ${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      return `Saved ${hrs}h ago`;
    }
    return null;
  }, [status, savedAt, now]);
  if (!label) return null;

  const Icon =
    status === "saving" ? Loader2 : status === "dirty" ? CircleDot : Check;
  return (
    <div
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5",
        "text-[11px] font-medium",
        status === "saved" && "border-success-line bg-success-soft text-success-fg",
        status === "saving" && "border-border-default bg-surface-2 text-text-secondary",
        status === "dirty" && "border-warning-line bg-warning-soft text-warning-fg",
      )}
    >
      <Icon
        className={cn(
          "w-3 h-3",
          status === "saving" && "animate-spin",
        )}
        aria-hidden="true"
      />
      {label}
    </div>
  );
}

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
  // Autosave status machine: 'idle' | 'dirty' | 'saving' | 'saved'.
  // Starts idle so a fresh mount doesn't flash "Saved just now" — first
  // keystroke moves us to dirty, debounce fires → saving → saved.
  const [autosaveStatus, setAutosaveStatus] = useState("idle");
  const [savedAt, setSavedAt] = useState(null);

  const scheduleAutosave = useCallback(
    (next) => {
      if (typeof window === "undefined") return;
      clearTimeout(debounceRef.current);
      setAutosaveStatus("dirty");
      debounceRef.current = setTimeout(() => {
        setAutosaveStatus("saving");
        try {
          window.localStorage.setItem(autosaveKey, next);
          setAutosaveStatus("saved");
          setSavedAt(Date.now());
        } catch {
          // Storage quota — silent drop; draft is not source of truth.
          // Leave the pill in 'dirty' so the user knows the draft is not
          // safe (they may want to copy the code to a scratch file).
          setAutosaveStatus("dirty");
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
    <div className="space-y-2">
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
      <div className="flex items-center justify-between text-[11px] text-text-tertiary">
        <span>Drafts autosave locally every 5s — cleared on submit.</span>
        <AutosaveIndicator status={autosaveStatus} savedAt={savedAt} />
      </div>
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
