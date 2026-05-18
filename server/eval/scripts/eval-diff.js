#!/usr/bin/env node
// ============================================================================
// eval-diff — compare two eval reports
// ============================================================================
//
// Usage:
//   npm run eval:diff -- <baseline.json> <new.json>
//
// Prints a side-by-side delta table for the metrics that move under prompt
// changes. Direction-aware: lower-is-better metrics (latency, error_rate,
// cost) are shown improving when they decrease; higher-is-better metrics
// (valid_rate, assertions.pass_rate) when they increase. Each row has a
// glyph: ✓ improved · = unchanged · ✗ regressed.
//
// Tolerances:
//   - Numeric metrics: changes < 0.5% (relative) shown as "unchanged"
//   - Counts (n, total): exact equality
// ============================================================================

import { promises as fs } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("usage: eval-diff <baseline.json> <new.json>");
  process.exit(1);
}

const [baselinePath, newPath] = args;
const baseline = JSON.parse(await fs.readFile(baselinePath, "utf8"));
const next = JSON.parse(await fs.readFile(newPath, "utf8"));

if (baseline.surface !== next.surface) {
  console.warn(
    `⚠ surfaces differ: baseline=${baseline.surface} new=${next.surface}. Comparison may be apples to oranges.`,
  );
}

console.log("\n┌─ eval-diff ────────────────────────────────────────────");
console.log(`│ baseline: ${path.basename(baselinePath)}  (${baseline.itemCount} items)`);
console.log(`│ new:      ${path.basename(newPath)}  (${next.itemCount} items)`);
console.log(`│ surface:  ${baseline.surface}`);
console.log("└─────────────────────────────────────────────────────────\n");

// (path, label, direction) where direction is "lower-better" | "higher-better"
const ROWS = [
  ["summary.basic.error_rate", "error_rate", "lower"],
  ["summary.basic.latency_ms.p50", "latency_p50_ms", "lower"],
  ["summary.basic.latency_ms.p95", "latency_p95_ms", "lower"],
  ["summary.basic.latency_ms.max", "latency_max_ms", "lower"],
  ["summary.basic.tokens.avg_total", "avg_total_tokens", "lower"],
  ["summary.basic.cost_usd.avg_usd", "avg_cost_usd", "lower"],
  ["summary.basic.cost_usd.projected_per_1k_usd", "$/1k_calls", "lower"],
  ["summary.basic.output_length_chars.p50", "output_len_p50", "neutral"],
  ["summary.basic.assertions.pass_rate", "assertions_pass_rate", "higher"],
  ["summary.validation.valid_rate", "valid_rate", "higher"],
];

const TOL = 0.005; // 0.5% relative, below which we call it unchanged

const padLabel = 26;
const padValue = 12;

console.log(`  ${"metric".padEnd(padLabel)}${"baseline".padEnd(padValue)}${"new".padEnd(padValue)}${"delta".padEnd(15)} `);
console.log(`  ${"".padEnd(padLabel + padValue * 2 + 18, "─")}`);

for (const [pathStr, label, direction] of ROWS) {
  const a = readPath(baseline, pathStr);
  const b = readPath(next, pathStr);
  printRow(label, a, b, direction);
}

console.log("\n  per-tag valid_rate:");
const tagsA = readPath(baseline, "summary.basic.by_tag") || {};
const tagsB = readPath(next, "summary.basic.by_tag") || {};
const allTags = [...new Set([...Object.keys(tagsA), ...Object.keys(tagsB)])].sort();
for (const tag of allTags) {
  const a = tagsA[tag]?.valid_rate;
  const b = tagsB[tag]?.valid_rate;
  printRow(`  ${tag}`, a, b, "higher");
}

console.log();

// ── helpers ──────────────────────────────────────────────────────────

function readPath(obj, dotted) {
  const parts = dotted.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function printRow(label, a, b, direction) {
  const aStr = formatVal(a);
  const bStr = formatVal(b);
  const { deltaStr, glyph, color } = computeDelta(a, b, direction);

  const line = `  ${label.padEnd(padLabel)}${aStr.padEnd(padValue)}${bStr.padEnd(padValue)}${deltaStr.padEnd(15)} ${glyph}`;
  console.log(color ? `${color}${line}\x1b[0m` : line);
}

function formatVal(v) {
  if (v == null) return "—";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return String(v);
    if (Math.abs(v) < 0.01) return v.toExponential(2);
    return v.toFixed(3);
  }
  return String(v);
}

function computeDelta(a, b, direction) {
  const noColor = "";
  const greenBold = "\x1b[32m";
  const redBold = "\x1b[31m";

  if (a == null && b == null) {
    return { deltaStr: "—", glyph: "·", color: noColor };
  }
  if (a == null) return { deltaStr: "(new)", glyph: "·", color: noColor };
  if (b == null) return { deltaStr: "(removed)", glyph: "·", color: noColor };

  const numA = Number(a);
  const numB = Number(b);
  if (Number.isFinite(numA) && Number.isFinite(numB)) {
    const abs = numB - numA;
    const rel = numA === 0 ? (abs === 0 ? 0 : Infinity) : abs / numA;

    let glyph = "=";
    let color = noColor;
    if (Math.abs(rel) >= TOL) {
      const better =
        (direction === "lower" && abs < 0) ||
        (direction === "higher" && abs > 0);
      if (direction !== "neutral") {
        glyph = better ? "✓" : "✗";
        color = better ? greenBold : redBold;
      } else {
        glyph = abs < 0 ? "↓" : "↑";
      }
    }

    const sign = abs > 0 ? "+" : "";
    const relStr = Number.isFinite(rel) ? ` (${sign}${(rel * 100).toFixed(1)}%)` : "";
    return {
      deltaStr: `${sign}${formatNum(abs)}${relStr}`,
      glyph,
      color,
    };
  }

  return { deltaStr: a === b ? "=" : "≠", glyph: a === b ? "=" : "·", color: noColor };
}

function formatNum(v) {
  if (Number.isInteger(v)) return String(v);
  if (Math.abs(v) < 0.01) return v.toExponential(2);
  return v.toFixed(3);
}
