# Eval harness

> The point of this directory: **measure AI surfaces against fixed inputs so prompt / model / parameter changes are visible as numbers, not vibes.**

## Quickstart

```bash
cd server
npm run eval:notes
```

Runs the `note-summary` surface against `golden-sets/note-summary.json` and prints a metrics summary. A timestamped JSON report lands in `eval/reports/`.

## Directory layout

```
server/eval/
├── README.md                      ← you're here
├── runner.js                      ← generic harness: load set → call surface → compute metrics → save report
├── surfaces/
│   └── note-summary.js            ← adapter: how to call the note-summary AI surface
├── metrics/
│   └── basic.js                   ← latency, validation pass-rate, length stats, error rate
├── golden-sets/
│   ├── README.md                  ← schema + how to add items
│   └── note-summary.json          ← seed: 5 hand-picked notes
├── scripts/
│   └── eval-note-summary.js       ← entry point invoked by `npm run eval:notes`
└── reports/                       ← gitignored; one JSON file per run
```

## Conceptual model

A run is `(golden_set, surface, metrics) → report`.

- **Golden set** — JSON array of test cases. Each case has an `id`, a tagged input, and optional assertions.
- **Surface** — a function `(input) => Promise<{ output, raw, tokens, error? }>`. Wraps the AI call so the runner is agnostic to which surface is being tested.
- **Metrics** — functions `(results, items) => Promise<MetricSummary>` that compute aggregate stats. Compose freely.
- **Report** — `{ runId, surface, metrics, results: [...] }` written to `reports/`.

## Adding a new surface to evaluate

1. Add an adapter under `surfaces/<name>.js` that exposes `run(input) => { output, raw, tokens, error? }`.
2. Create a golden set under `golden-sets/<name>.json` (see schema doc in that folder).
3. Create a script under `scripts/eval-<name>.js` that wires the runner together.
4. Register `eval:<name>` in `server/package.json`.

That's it. Reuse the runner; reuse `metrics/basic.js` if it fits, or write surface-specific metrics.

## What this is not

- **Not unit tests.** Unit tests assert pass/fail on deterministic logic. Evals score stochastic behaviour — no green/red, only better/worse.
- **Not integration tests.** Those run end-to-end against a real DB and API. Evals isolate one prompt + model surface.
- **Not vibe checks.** Vibes are private; evals produce numbers anyone can review.

## Cost note

Each run hits the OpenAI API. The `note-summary` set at 5 items × ~$0.0002 per call ≈ $0.001 per run. As you grow the golden set or add LLM-as-judge metrics, cost rises sub-linearly. Set a budget; track it; don't run evals in pre-commit hooks.

## Goodhart's law warning

Once you have a metric, the temptation is to optimize it. Goodhart's law: *when a measure becomes a target, it ceases to be a good measure.* Mitigate by:
- Tracking ≥3 metrics per surface, not 1
- Adding adversarial items to the golden set faster than you optimize
- Reviewing the actual outputs, not just the summaries, every time you ship a prompt change
