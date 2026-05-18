// ============================================================================
// Notes — AI "from templates" streaming helper
// ============================================================================
//
// The server endpoint /notes/from-templates returns NDJSON over a chunked
// HTTP response (Content-Type: application/x-ndjson). Axios buffers full
// responses; we need raw streaming, so we use fetch + ReadableStream
// directly here. JWT is read from localStorage to mirror the api.js
// request interceptor.
//
// Usage:
//
//   for await (const event of streamGenerateNoteFromTemplates({
//     templateNoteIds, problemId, targetFolderId,
//   })) {
//     if (event.chunk) appendToPreview(event.chunk);
//     else if (event.done) navigate(`/notes/${event.noteId}`);
//     else if (event.error) toast.error(event.error);
//   }
// ============================================================================

const BASE = import.meta.env.VITE_API_URL || "/api";

export async function* streamGenerateNoteFromTemplates(body, { signal } = {}) {
    const token = localStorage.getItem("token");
    const res = await fetch(`${BASE}/notes/from-templates`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            Accept: "application/x-ndjson",
        },
        body: JSON.stringify(body),
        signal,
    });

    // Non-2xx — server replied with a single JSON envelope (no streaming).
    if (!res.ok) {
        let message = `Request failed (${res.status})`;
        let code = null;
        try {
            const data = await res.json();
            message = data?.error?.message || message;
            code = data?.error?.code || null;
        } catch {
            // body wasn't JSON; keep default message
        }
        yield { error: message, code };
        return;
    }

    if (!res.body) {
        yield { error: "Streaming not supported by this browser", code: "NO_STREAM" };
        return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // NDJSON: split on newlines, parse complete lines, retain
            // any partial line in the buffer.
            let nl;
            while ((nl = buffer.indexOf("\n")) >= 0) {
                const line = buffer.slice(0, nl).trim();
                buffer = buffer.slice(nl + 1);
                if (!line) continue;
                try {
                    yield JSON.parse(line);
                } catch (e) {
                    // Malformed line — skip but keep the stream alive.
                    console.warn("[ai-from-templates] malformed line:", line, e);
                }
            }
        }
        // Flush any final line without trailing newline.
        if (buffer.trim()) {
            try {
                yield JSON.parse(buffer.trim());
            } catch (e) {
                console.warn("[ai-from-templates] malformed trailing line:", buffer, e);
            }
        }
    } finally {
        // Best-effort release; if the user aborted, the reader is already gone.
        try { reader.releaseLock(); } catch { /* noop */ }
    }
}
