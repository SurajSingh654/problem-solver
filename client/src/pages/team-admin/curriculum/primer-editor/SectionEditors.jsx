// ============================================================================
// SectionEditors.jsx — per-type editor components for all 12 primer types
// ============================================================================
//
// Each editor receives `{ section, onChange }` and calls `onChange` with the
// full updated section object on any field edit. Kept small + inline so a
// future author-UI review can hit them all in one file.
//
// Editor components use plain <textarea> / <input> for now — the MarkdownEditor
// (loaded via @uiw/react-md-editor) is heavier than these editors need for
// small fields, and the shared shell doesn't yet handle inline rich-preview
// well. If a specific section type outgrows the plain textarea (mentalModel /
// body / codeReference), swap to MarkdownEditor per-type without touching the
// registry.
// ============================================================================
import { useMemo } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { MarkdownEditor } from '@components/curriculum'
import { ExcalidrawEditor } from '@components/ui/ExcalidrawEditor'

// Shared label/subtext + input shells so every editor looks identical.
function Field({ label, hint, children }) {
    return (
        <div className="space-y-1.5">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-text-tertiary">
                {label}
            </label>
            {children}
            {hint && (
                <p className="text-[11px] text-text-tertiary leading-relaxed">
                    {hint}
                </p>
            )}
        </div>
    )
}

function TextInput({ value, onChange, placeholder, maxLength }) {
    return (
        <input
            type="text"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            maxLength={maxLength}
            className="w-full bg-surface-1 border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand-400"
        />
    )
}

function TextArea({ value, onChange, placeholder, rows = 4 }) {
    return (
        <textarea
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={rows}
            className="w-full bg-surface-1 border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand-400 font-mono resize-y"
        />
    )
}

// ── objectives ───────────────────────────────────────────────────────
export function ObjectivesEditor({ section, onChange }) {
    const items = Array.isArray(section.items) ? section.items : []
    const setItem = (i, patch) => {
        const next = [...items]
        next[i] = { ...next[i], ...patch }
        onChange({ ...section, items: next })
    }
    const removeItem = (i) => {
        const next = items.filter((_, idx) => idx !== i)
        onChange({ ...section, items: next.length ? next : [{ verb: '', outcome: '' }] })
    }
    const addItem = () =>
        onChange({ ...section, items: [...items, { verb: '', outcome: '' }] })
    return (
        <div className="space-y-3">
            <p className="text-[11px] text-text-tertiary leading-relaxed">
                2-4 items. Verb (identify / derive / compare / diagnose) + concrete outcome.
                Bloom level is optional and hints at cognitive depth.
            </p>
            {items.map((it, i) => (
                <div
                    key={i}
                    className="grid grid-cols-[100px_1fr_120px_auto] gap-2 items-start"
                >
                    <TextInput
                        value={it.verb}
                        onChange={(v) => setItem(i, { verb: v })}
                        placeholder="verb"
                        maxLength={40}
                    />
                    <TextInput
                        value={it.outcome}
                        onChange={(v) => setItem(i, { outcome: v })}
                        placeholder="outcome"
                        maxLength={240}
                    />
                    <select
                        value={it.bloomLevel ?? ''}
                        onChange={(e) =>
                            setItem(i, { bloomLevel: e.target.value || undefined })
                        }
                        className="w-full bg-surface-1 border border-border-default rounded-lg px-2 py-2 text-xs text-text-primary"
                    >
                        <option value="">bloom…</option>
                        <option value="remember">remember</option>
                        <option value="understand">understand</option>
                        <option value="apply">apply</option>
                        <option value="analyze">analyze</option>
                        <option value="evaluate">evaluate</option>
                        <option value="create">create</option>
                    </select>
                    <button
                        type="button"
                        onClick={() => removeItem(i)}
                        aria-label="Remove objective"
                        className="p-2 rounded hover:bg-surface-2 text-text-tertiary hover:text-danger-fg"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            ))}
            <button
                type="button"
                onClick={addItem}
                disabled={items.length >= 6}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-fg-soft hover:text-brand-600 disabled:opacity-40"
            >
                <Plus className="w-3.5 h-3.5" />
                Add objective
            </button>
        </div>
    )
}

// ── prerequisites ────────────────────────────────────────────────────
export function PrerequisitesEditor({ section, onChange }) {
    return (
        <div className="space-y-3">
            <p className="text-[11px] text-text-tertiary leading-relaxed">
                Prereq concepts themselves are managed on the concept graph
                (ConceptDependency) — this section renders a warning strip
                that links to them. Use the note field to add context that
                applies to all prereqs (e.g. "these three are dense, budget
                a full session before moving on").
            </p>
            <Field
                label="Note (optional)"
                hint="Displayed above the prereq link list. Keep under 400 chars."
            >
                <TextArea
                    value={section.note}
                    onChange={(v) => onChange({ ...section, note: v })}
                    placeholder="Anything the learner should know before starting…"
                    rows={2}
                />
            </Field>
        </div>
    )
}

// ── mentalModel ──────────────────────────────────────────────────────
export function MentalModelEditor({ section, onChange }) {
    return (
        <div className="space-y-3">
            <Field
                label="Markdown"
                hint="3-5 sentences framing the concept. Analogy or 'here's the picture' shape works best."
            >
                <MarkdownEditor
                    value={section.markdown}
                    onChange={(v) => onChange({ ...section, markdown: v })}
                    height={200}
                />
            </Field>
            <Field
                label="Diagram URL (optional)"
                hint="Image URL for the diagram. Must be http(s). Paste a hosted image link."
            >
                <TextInput
                    value={section.diagramUrl}
                    onChange={(v) =>
                        onChange({ ...section, diagramUrl: v || undefined })
                    }
                    placeholder="https://…"
                    maxLength={2000}
                />
            </Field>
        </div>
    )
}

// ── body ─────────────────────────────────────────────────────────────
export function BodyEditor({ section, onChange }) {
    return (
        <div className="space-y-3">
            <Field
                label="Heading (optional)"
                hint="Renders above the markdown as a section label."
            >
                <TextInput
                    value={section.heading}
                    onChange={(v) =>
                        onChange({ ...section, heading: v || undefined })
                    }
                    placeholder="e.g. Deep dive"
                    maxLength={120}
                />
            </Field>
            <Field label="Markdown">
                <MarkdownEditor
                    value={section.markdown}
                    onChange={(v) => onChange({ ...section, markdown: v })}
                    height={360}
                />
            </Field>
        </div>
    )
}

// ── workedExample ───────────────────────────────────────────────────
export function WorkedExampleEditor({ section, onChange }) {
    return (
        <Field
            label="Markdown"
            hint="A concrete walk-through applying the mental model."
        >
            <MarkdownEditor
                value={section.markdown}
                onChange={(v) => onChange({ ...section, markdown: v })}
                height={280}
            />
        </Field>
    )
}

// ── checkYourself ────────────────────────────────────────────────────
export function CheckYourselfEditor({ section, onChange }) {
    return (
        <div className="space-y-3">
            <p className="text-[11px] text-text-tertiary leading-relaxed">
                This section renders the concept's <code>expectedQuestions</code>
                array (edit that under Metadata → Expected Questions). The
                choice below controls whether each prompt shows inline or
                behind a reveal-on-click accordion.
            </p>
            <Field label="Reveal mode">
                <select
                    value={section.revealMode ?? 'click'}
                    onChange={(e) =>
                        onChange({ ...section, revealMode: e.target.value })
                    }
                    className="w-full bg-surface-1 border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary"
                >
                    <option value="click">click — reveal on tap (recommended)</option>
                    <option value="static">static — plain list</option>
                </select>
            </Field>
        </div>
    )
}

// ── cheatsheet ───────────────────────────────────────────────────────
export function CheatsheetEditor({ section, onChange }) {
    return (
        <Field
            label="Markdown"
            hint="Compact reference. Collapsed by default on the learner surface."
        >
            <MarkdownEditor
                value={section.markdown}
                onChange={(v) => onChange({ ...section, markdown: v })}
                height={280}
            />
        </Field>
    )
}

// ── codeReference ────────────────────────────────────────────────────
export function CodeReferenceEditor({ section, onChange }) {
    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
                <Field label="Language (optional)" hint="e.g. java, python, sql">
                    <TextInput
                        value={section.language}
                        onChange={(v) =>
                            onChange({ ...section, language: v || undefined })
                        }
                        placeholder="java"
                        maxLength={40}
                    />
                </Field>
                <Field label="Kind (optional)" hint="e.g. syntax, api, config, queries">
                    <TextInput
                        value={section.kind}
                        onChange={(v) =>
                            onChange({ ...section, kind: v || undefined })
                        }
                        placeholder="syntax"
                        maxLength={40}
                    />
                </Field>
            </div>
            <Field label="Markdown">
                <MarkdownEditor
                    value={section.markdown}
                    onChange={(v) => onChange({ ...section, markdown: v })}
                    height={280}
                />
            </Field>
        </div>
    )
}

// ── diagram ──────────────────────────────────────────────────────────
// Three optional input slots — Excalidraw scene, hosted image URL, and
// markdown/ASCII fallback. Author fills at least one; reader picks by
// precedence: excalidraw > URL > markdown. Showing all three at once
// avoids the "switching modes drops content" data-loss bug the earlier
// mode-toggle version had.
export function DiagramEditor({ section, onChange }) {
    // Parse the persisted Excalidraw JSON on first mount so the editor
    // opens to the existing scene. useMemo because ExcalidrawEditor's
    // `initialData` is only consumed on its own mount.
    const excalidrawInitial = useMemo(() => {
        try {
            const parsed = JSON.parse(section?.excalidraw ?? '[]')
            return Array.isArray(parsed) ? { elements: parsed } : null
        } catch {
            return null
        }
    }, [section?.excalidraw])

    const hasAnyContent =
        Boolean(section?.excalidraw) ||
        Boolean(section?.diagramUrl && section.diagramUrl.length > 0) ||
        Boolean(section?.markdown && section.markdown.length > 0)

    return (
        <div className="space-y-4">
            <div className="rounded-lg border border-border-default bg-surface-1 px-3 py-2">
                <p className="text-[11px] text-text-tertiary leading-relaxed">
                    Fill any one of the slots below. Precedence when
                    rendering: <strong>Excalidraw</strong> → <strong>URL</strong>{' '}
                    → <strong>Markdown</strong>. If nothing is filled the
                    server will reject Save.
                </p>
            </div>

            <Field
                label="Excalidraw scene (preferred)"
                hint="Draw inline. Auto-saves to the section on any edit. Scene JSON travels with the concept — no external CDN dependency."
            >
                <div className="h-[420px] w-full rounded-lg overflow-hidden border border-border-default bg-surface-1">
                    <ExcalidrawEditor
                        initialData={excalidrawInitial}
                        onChange={(json) =>
                            onChange({ ...section, excalidraw: json })
                        }
                    />
                </div>
                {section?.excalidraw && (
                    <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[10px] font-mono text-text-tertiary">
                            {section.excalidraw.length.toLocaleString()} chars in scene JSON
                        </span>
                        <button
                            type="button"
                            onClick={() =>
                                onChange({ ...section, excalidraw: undefined })
                            }
                            className="text-[10px] font-semibold text-text-tertiary hover:text-danger-fg"
                        >
                            Clear scene
                        </button>
                    </div>
                )}
            </Field>

            <Field
                label="Image URL"
                hint="http(s) only. Non-http URLs are stripped by the sanitizer. Falls back to this when no Excalidraw scene is present."
            >
                <TextInput
                    value={section.diagramUrl}
                    onChange={(v) =>
                        onChange({ ...section, diagramUrl: v || undefined })
                    }
                    placeholder="https://…"
                    maxLength={2000}
                />
            </Field>

            <Field
                label="Markdown / ASCII fallback"
                hint="ASCII art or a text description. Rendered when neither Excalidraw nor URL is set."
            >
                <TextArea
                    value={section.markdown}
                    onChange={(v) =>
                        onChange({ ...section, markdown: v || undefined })
                    }
                    rows={5}
                />
            </Field>

            <Field label="Caption (optional)">
                <TextInput
                    value={section.caption}
                    onChange={(v) =>
                        onChange({ ...section, caption: v || undefined })
                    }
                    maxLength={240}
                />
            </Field>

            {!hasAnyContent && (
                <div className="rounded-lg border border-warning-line bg-warning-soft px-3 py-2">
                    <p className="text-[11px] text-warning-fg leading-relaxed">
                        This diagram section has no content yet. Fill one of
                        Excalidraw / URL / Markdown above before saving — the
                        server rejects an empty diagram.
                    </p>
                </div>
            )}
        </div>
    )
}

// Common markdown+dimensions editor — used by comparison + complexity.
function MarkdownAndDimensions({
    section,
    onChange,
    dimensionsHint,
    dimensionOptions,
}) {
    const dims = Array.isArray(section.dimensions) ? section.dimensions : []
    const toggle = (d) => {
        const next = dims.includes(d) ? dims.filter((x) => x !== d) : [...dims, d]
        onChange({ ...section, dimensions: next })
    }
    return (
        <div className="space-y-3">
            {dimensionOptions ? (
                <Field label="Dimensions" hint={dimensionsHint}>
                    <div className="flex flex-wrap gap-1.5">
                        {dimensionOptions.map((d) => {
                            const on = dims.includes(d)
                            return (
                                <button
                                    key={d}
                                    type="button"
                                    onClick={() => toggle(d)}
                                    className={`inline-flex items-center rounded-full border font-semibold leading-none whitespace-nowrap text-[10px] uppercase tracking-wider px-2 py-1 ${
                                        on
                                            ? 'bg-brand-soft text-brand-fg-soft border-brand-line'
                                            : 'bg-surface-1 text-text-tertiary border-border-default hover:text-text-secondary'
                                    }`}
                                >
                                    {d}
                                </button>
                            )
                        })}
                    </div>
                </Field>
            ) : (
                <Field
                    label="Dimensions (optional)"
                    hint={
                        dimensionsHint ??
                        'Comma-separated labels — nudges you to write a comparison table.'
                    }
                >
                    <TextInput
                        value={dims.join(', ')}
                        onChange={(v) =>
                            onChange({
                                ...section,
                                dimensions: v
                                    .split(',')
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                            })
                        }
                        placeholder="e.g. read, write, consistency"
                        maxLength={200}
                    />
                </Field>
            )}
            <Field label="Markdown">
                <MarkdownEditor
                    value={section.markdown}
                    onChange={(v) => onChange({ ...section, markdown: v })}
                    height={260}
                />
            </Field>
        </div>
    )
}

// ── comparison ───────────────────────────────────────────────────────
export function ComparisonEditor({ section, onChange }) {
    return (
        <MarkdownAndDimensions
            section={section}
            onChange={onChange}
            dimensionsHint="Comma-separated dimensions. E.g. 'consistency, availability, partition-tolerance' for a CAP comparison."
        />
    )
}

// ── gotchas ──────────────────────────────────────────────────────────
export function GotchasEditor({ section, onChange }) {
    return (
        <Field
            label="Markdown"
            hint="Anti-patterns, failure modes, common mistakes. Rendered in a warning-toned callout."
        >
            <MarkdownEditor
                value={section.markdown}
                onChange={(v) => onChange({ ...section, markdown: v })}
                height={260}
            />
        </Field>
    )
}

// ── complexity ───────────────────────────────────────────────────────
export function ComplexityEditor({ section, onChange }) {
    return (
        <MarkdownAndDimensions
            section={section}
            onChange={onChange}
            dimensionsHint="Which dimensions the analysis covers. Renders as badges above the prose."
            dimensionOptions={['time', 'space', 'io', 'bandwidth', 'cost']}
        />
    )
}

// Registry lives in `./editorRegistry.js` so this file stays
// components-only (Fast Refresh requirement).
