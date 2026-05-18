// ============================================================================
// AI cost lookup
// ============================================================================
//
// Table is small and intentionally hand-maintained — pricing changes rarely
// enough that hard-coding is fine, and a one-source-of-truth file beats
// scraping. Update when OpenAI changes their rates.
//
// Source: https://openai.com/api/pricing — cross-check before relying on
// numbers for any decision that costs more than the call itself.
// Last updated: 2026-05-18.
// ============================================================================

// USD per 1 MILLION tokens (input, output).
const PRICE_PER_MILLION = {
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4-turbo": { input: 10.0, output: 30.0 },
  "o1-mini": { input: 3.0, output: 12.0 },
  "o1": { input: 15.0, output: 60.0 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
  "text-embedding-3-large": { input: 0.13, output: 0 },
};

export function priceFor(model) {
  if (!model) return null;
  // Substring match catches dated variants (gpt-4o-2024-08-06 → gpt-4o).
  for (const [key, price] of Object.entries(PRICE_PER_MILLION)) {
    if (model === key || model.startsWith(`${key}-`)) return price;
  }
  return null;
}

// Returns USD cost or null if model unknown.
export function calcCostUsd({ model, promptTokens, completionTokens }) {
  const p = priceFor(model);
  if (!p) return null;
  const inP = Number(promptTokens) || 0;
  const outP = Number(completionTokens) || 0;
  return (inP * p.input + outP * p.output) / 1_000_000;
}
