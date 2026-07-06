// ============================================================================
// CodeReviewResult — renders a structured LabAttempt code-review payload.
// ============================================================================
//
// Consumes the JSON blob produced by server/src/services/ai.schemas.js
// ::codeReviewSchema (Week 4 async review pipeline). See task plan
// docs/superpowers/plans/2026-07-06-curriculum-phase-1-w5-plan.md T2.
//
// Layout:
//   1. Overall verdict badge + markdown summary (colored container)
//   2. 6-dim grid (correctness / concept / design / idiomatic / robustness / testing)
//   3. Findings sections — whatYouGotRight / thingsToImprove / bugs (each hidden
//      when empty; bugs render severity too)
//   4. mentalModelSignal (markdown, above a divider) when present
//   5. Footer: nextStep human copy via NEXT_STEP_COPY (fallback to raw enum)
//
// Only `overall` and `mentalModelSignal` are routed through MarkdownRenderer —
// every other string is plain JSX text (React auto-escapes). All markdown
// flows through the shared MarkdownRenderer, which already routes through
// DOMPurify.
// ============================================================================
import { cn } from "@utils/cn";
import { MarkdownRenderer } from "../ui/MarkdownRenderer.jsx";

// Same semantic-token mapping the shared VerdictBadge uses. Only the three
// enum values codeReviewSchema emits are represented here.
const VERDICT_STYLES = {
  STRONG: {
    label: "STRONG",
    container: "bg-success-soft text-success-fg border-success-line",
    badge: "bg-success-soft text-success-fg border-success-line",
  },
  ADEQUATE: {
    label: "ADEQUATE",
    container: "bg-warning-soft text-warning-fg border-warning-line",
    badge: "bg-warning-soft text-warning-fg border-warning-line",
  },
  WEAK: {
    label: "WEAK",
    container: "bg-danger-soft text-danger-fg border-danger-line",
    badge: "bg-danger-soft text-danger-fg border-danger-line",
  },
};

const NEUTRAL_STYLE = {
  label: "UNKNOWN",
  container: "bg-surface-3 text-text-secondary border-border-default",
  badge: "bg-surface-3 text-text-secondary border-border-default",
};

const NEXT_STEP_COPY = {
  READY_FOR_REFERENCE: "You can reveal the reference solution now.",
  TRY_AGAIN: "Try another attempt — you're close.",
  SEEK_HELP: "Consider reviewing the primer or asking for help.",
};

// Severity → same three-tone palette. HIGH == danger, MEDIUM == warning,
// LOW == neutral. Anything else falls through to neutral.
const SEVERITY_STYLES = {
  HIGH: "bg-danger-soft text-danger-fg border-danger-line",
  MEDIUM: "bg-warning-soft text-warning-fg border-warning-line",
  LOW: "bg-surface-3 text-text-secondary border-border-default",
};

function pickVerdictStyle(verdict) {
  return VERDICT_STYLES[verdict] ?? NEUTRAL_STYLE;
}

function DimBadge({ label, verdict }) {
  const style = pickVerdictStyle(verdict);
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-md border px-3 py-2",
        "border-border-default bg-surface-1",
      )}
    >
      <div className="text-xs font-medium text-text-secondary">{label}</div>
      <span
        className={cn(
          "inline-flex w-fit items-center rounded-full border",
          "text-[10px] font-semibold uppercase leading-none",
          "px-2 py-0.5",
          style.badge,
        )}
      >
        {style.label}
      </span>
    </div>
  );
}

function LineRef({ lineRef }) {
  if (!lineRef) return null;
  return (
    <span className="ml-2 rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-text-tertiary">
      {lineRef}
    </span>
  );
}

function FindingsSection({ title, items, renderItem }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((entry, idx) => (
          <li
            key={idx}
            className="flex items-start gap-2 text-sm text-text-secondary"
          >
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-text-tertiary" />
            <div className="min-w-0 flex-1">{renderItem(entry)}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function CodeReviewResult({ review }) {
  if (!review) return null;

  const overallStyle = pickVerdictStyle(
    review.codeReviewVerdict ?? review.overall,
  );

  const nextStepCopy = review.nextStep
    ? NEXT_STEP_COPY[review.nextStep] ?? review.nextStep
    : null;

  return (
    <div className="space-y-6">
      {/* 1. Overall verdict + markdown summary */}
      <div
        className={cn(
          "rounded-lg border p-4",
          overallStyle.container,
        )}
      >
        <div className="mb-3 flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-full border",
              "text-xs font-semibold uppercase leading-none",
              "px-2.5 py-1",
              overallStyle.badge,
            )}
          >
            {overallStyle.label}
          </span>
          <span className="text-xs font-medium opacity-80">
            Overall verdict
          </span>
        </div>
        {review.overall && (
          <MarkdownRenderer content={review.overall} size="sm" />
        )}
      </div>

      {/* 2. 6-dim grid */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <DimBadge label="Correctness" verdict={review.correctness} />
        <DimBadge
          label="Concept application"
          verdict={review.conceptApplication}
        />
        <DimBadge label="Design quality" verdict={review.designQuality} />
        <DimBadge label="Idiomatic style" verdict={review.idiomaticStyle} />
        <DimBadge label="Robustness" verdict={review.robustness} />
        <DimBadge label="Testing" verdict={review.testing} />
      </div>

      {/* 3. Findings sections */}
      <div className="space-y-5">
        <FindingsSection
          title="What you got right"
          items={review.whatYouGotRight}
          renderItem={(entry) => (
            <>
              <span className="text-text-primary">{entry.item}</span>
              <LineRef lineRef={entry.lineRef} />
            </>
          )}
        />
        <FindingsSection
          title="Things to improve"
          items={review.thingsToImprove}
          renderItem={(entry) => (
            <>
              <span className="text-text-primary">{entry.item}</span>
              <LineRef lineRef={entry.lineRef} />
            </>
          )}
        />
        <FindingsSection
          title="Bugs"
          items={review.bugs}
          renderItem={(entry) => {
            const severityClass =
              SEVERITY_STYLES[entry.severity] ?? SEVERITY_STYLES.LOW;
            return (
              <>
                <span className="text-text-primary">{entry.description}</span>
                {entry.severity && (
                  <span
                    className={cn(
                      "ml-2 inline-flex items-center rounded-full border",
                      "text-[10px] font-semibold uppercase leading-none",
                      "px-1.5 py-0.5",
                      severityClass,
                    )}
                  >
                    {entry.severity}
                  </span>
                )}
                <LineRef lineRef={entry.lineRef} />
              </>
            );
          }}
        />
      </div>

      {/* 4. Mental-model signal (markdown, divider above) */}
      {review.mentalModelSignal && (
        <div className="border-t border-border-default pt-5">
          <h3 className="mb-2 text-sm font-semibold text-text-primary">
            Mental model signal
          </h3>
          <MarkdownRenderer content={review.mentalModelSignal} size="sm" />
        </div>
      )}

      {/* 5. Next step footer */}
      {nextStepCopy && (
        <div
          className={cn(
            "rounded-md border border-border-default bg-surface-1",
            "px-4 py-3 text-sm text-text-primary",
          )}
        >
          <span className="font-semibold">Next step: </span>
          {nextStepCopy}
        </div>
      )}
    </div>
  );
}
