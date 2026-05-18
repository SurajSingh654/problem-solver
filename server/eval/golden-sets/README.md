# Golden sets

Each file is a JSON array of test cases for one surface.

## Schema (per item)

```jsonc
{
  "id": "summary-001",                       // unique within the set
  "tags": ["short", "technical"],            // for filtering / slicing reports
  "input": { /* shape varies by surface */ },
  "assertions": {                            // optional regression checks
    "minLength": 100,
    "maxLength": 4000,
    "mustMention": ["two-pointer"],
    "mustNotMention": ["lorem ipsum"],
    "shape": ["tldr", "keyTakeaways"]        // dotted paths required to exist
  }
}
```

`assertions` is enforced by `eval/metrics/basic.js`. All fields are optional — assert nothing if you can't.

## How to add adversarial items

The whole point of evals is catching regressions on hard inputs. Common adversarial categories:

- **Edge length** — empty input, 1-word input, very long input
- **Wrong format** — code-only, table-only, non-English text
- **Self-contradictory** — input that mentions A and ¬A
- **Prompt injection** — input that contains "ignore previous instructions"
- **Domain-confusion** — input about topic X tagged as topic Y
- **Repetition** — same sentence repeated 50 times

Add at least 1 of each as your set grows past 10.

## Versioning rule

Once you start measuring against a golden set, **don't silently change the items**. Either:

- Add new items (numbers grow — old IDs preserved)
- Or version the file: `note-summary.v2.json` and run both during transition

Changing items mid-flight makes A/B comparisons meaningless.
