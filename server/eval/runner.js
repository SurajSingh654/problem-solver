// ============================================================================
// Eval runner — generic harness
// ============================================================================
//
// (goldenSet, surface, metrics) → report
//
//   goldenSet : array of { id, tags?, input, assertions? }
//   surface   : async (input) => { output, raw?, tokens?, error? }
//   metrics   : { name: async (results, items) => any }
//
// Returns a Report and writes it to eval/reports/<timestamp>-<name>.json
// ============================================================================

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPORTS_DIR = path.join(__dirname, "reports");

export async function runEval({
  name,
  goldenSetPath,
  surface,
  metrics,
  concurrency = 1,
}) {
  const goldenSetRaw = await fs.readFile(goldenSetPath, "utf8");
  const items = JSON.parse(goldenSetRaw);
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(`Golden set is empty or not an array: ${goldenSetPath}`);
  }

  console.log(
    `\n┌─ eval: ${name} ─────────────────────────────────────────`,
  );
  console.log(`│ items: ${items.length}`);
  console.log(`│ golden set: ${path.relative(process.cwd(), goldenSetPath)}`);
  console.log(`│ concurrency: ${concurrency}`);
  console.log(
    `└─────────────────────────────────────────────────────────────\n`,
  );

  const results = [];
  if (concurrency === 1) {
    // Sequential — easier to read traces, gentler on rate limits.
    for (const item of items) {
      const r = await runOne(item, surface);
      results.push(r);
      printItemLine(r);
    }
  } else {
    // Bounded parallel. Useful when surface latency dominates.
    const queue = [...items];
    async function worker() {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) return;
        const r = await runOne(item, surface);
        results.push(r);
        printItemLine(r);
      }
    }
    await Promise.all(
      Array.from({ length: concurrency }, () => worker()),
    );
  }

  // Compute metrics
  const summary = {};
  for (const [metricName, fn] of Object.entries(metrics || {})) {
    try {
      summary[metricName] = await fn(results, items);
    } catch (err) {
      summary[metricName] = { error: err.message };
    }
  }

  const report = {
    runId: `${name}-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    surface: name,
    timestamp: new Date().toISOString(),
    itemCount: items.length,
    summary,
    results: results.map((r) => ({
      id: r.id,
      tags: r.tags ?? [],
      latencyMs: r.latencyMs,
      tokens: r.tokens ?? null,
      validation: r.validation ?? null,
      ok: !r.error,
      error: r.error ?? null,
      // Truncate output preview for readability; full output in raw if needed
      outputPreview: previewOutput(r.output),
    })),
  };

  await ensureDir(REPORTS_DIR);
  const reportPath = path.join(REPORTS_DIR, `${report.runId}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  printSummary(report);
  console.log(
    `\nreport: ${path.relative(process.cwd(), reportPath)}\n`,
  );

  return report;
}

async function runOne(item, surface) {
  const t0 = Date.now();
  try {
    const out = await surface(item.input);
    return {
      id: item.id,
      tags: item.tags ?? [],
      assertions: item.assertions ?? null,
      input: item.input,
      output: out?.output ?? null,
      raw: out?.raw ?? null,
      tokens: out?.tokens ?? null,
      validation: out?.validation ?? null,
      latencyMs: Date.now() - t0,
      error: out?.error ?? null,
    };
  } catch (err) {
    return {
      id: item.id,
      tags: item.tags ?? [],
      assertions: item.assertions ?? null,
      input: item.input,
      output: null,
      raw: null,
      tokens: null,
      validation: null,
      latencyMs: Date.now() - t0,
      error: err?.message || String(err),
    };
  }
}

function printItemLine(r) {
  const status = r.error ? "✗" : "✓";
  const lat = String(r.latencyMs).padStart(5, " ");
  const tokens = r.tokens?.totalTokens != null ? `${r.tokens.totalTokens}t` : "—";
  const cost = r.tokens?.costUsd != null ? `$${r.tokens.costUsd.toFixed(5)}` : "";
  const errSuffix = r.error ? `  ERR: ${truncate(r.error, 80)}` : "";
  console.log(
    `  ${status}  ${r.id.padEnd(28)}  ${lat}ms  ${tokens.padEnd(7)}${cost.padEnd(10)}${errSuffix}`,
  );
}

function printSummary(report) {
  console.log("\n┌─ summary ──────────────────────────────────────────────");
  for (const [name, value] of Object.entries(report.summary)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      console.log(`│ ${name}:`);
      for (const [k, v] of Object.entries(value)) {
        console.log(`│   ${k}: ${formatValue(v)}`);
      }
    } else {
      console.log(`│ ${name}: ${formatValue(value)}`);
    }
  }
  console.log("└─────────────────────────────────────────────────────────");
}

function formatValue(v) {
  if (typeof v === "number") {
    return Number.isInteger(v) ? String(v) : v.toFixed(3);
  }
  if (Array.isArray(v)) return JSON.stringify(v);
  if (v && typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function previewOutput(output) {
  if (output == null) return null;
  if (typeof output === "string") return truncate(output, 200);
  try {
    return truncate(JSON.stringify(output), 300);
  } catch {
    return "[unstringifiable]";
  }
}

function truncate(s, n) {
  if (typeof s !== "string") return s;
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}
