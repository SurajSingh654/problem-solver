// ============================================================================
// boot-check.js — import every server module and fail if any throws at load
// ============================================================================
//
// Written after the 2026-07-09 prod incident:
//   * `curriculum.schema.js` built a `z.discriminatedUnion` with a variant
//     wrapped in `.refine()` (produces `ZodEffects`).
//   * Zod threw `Cannot read properties of undefined (reading 'type')` at
//     MODULE IMPORT — before any request touched the file.
//   * `test:unit` never imported the module because no unit test used it,
//     so the pre-push gate cleared green.
//   * The container started up in prod, imported the controller that pulls
//     in the schema, and crashed on boot. Restart loop until reverted.
//
// This script imports every `.js` file under `server/src/` and reports any
// that throw. Deliberately dumb — no coverage instrumentation, no smart
// dependency graph — just "does the file load?". Runs in <5s.
//
// What we deliberately DO NOT do here:
//   * Import `src/index.js` — it calls `app.listen()` and would bind port 5000.
//   * Import Prisma migration files or scripts (outside src/).
//   * Care about warnings, deprecations, or open handles — only import failures.
//
// If the check ever grows > 15s it's time to be smarter. For now, dumb wins.
// ============================================================================

import { readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src");
const SKIP = new Set([join(SRC, "index.js")]);

async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const e of entries) {
        const p = join(dir, e.name);
        if (e.isDirectory()) files.push(...(await walk(p)));
        else if (e.name.endsWith(".js")) files.push(p);
    }
    return files;
}

const files = (await walk(SRC)).filter((f) => !SKIP.has(f));

const failures = [];
for (const file of files) {
    try {
        await import(pathToFileURL(file).href);
    } catch (err) {
        failures.push({
            file: file.replace(SRC + "/", "src/"),
            message: err?.message ?? String(err),
        });
    }
}

if (failures.length > 0) {
    process.stderr.write(
        `\x1b[31m✘ boot-check: ${failures.length} module(s) failed to import:\x1b[0m\n`,
    );
    for (const f of failures) {
        process.stderr.write(`  \x1b[31m${f.file}\x1b[0m\n    ${f.message}\n`);
    }
    process.exit(1);
}

process.stdout.write(
    `\x1b[32m✔\x1b[0m boot-check: ${files.length} modules imported cleanly.\n`,
);
