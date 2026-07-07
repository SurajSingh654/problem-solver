#!/usr/bin/env node
// client/scripts/validate-manifest.js
//
// Structural invariants on client/src/pages/docs/howto/manifest.js.
// Fails the pre-push hook if the manifest is inconsistent.
//
// Cannot actually execute the `component: () => import('./…')` arrow
// (JSX needs Vite's transform), so component-resolvability is checked
// by extracting the import-path via regex on the arrow-function source,
// then verifying the file exists with fs.existsSync.

import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { TASKS, GROUPS, ROLES } from '../src/pages/docs/howto/manifest.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const MANIFEST_DIR = resolve(__dirname, '../src/pages/docs/howto')

const errors = []

// 1. Unique task ids
const seenIds = new Set()
for (const t of TASKS) {
    if (seenIds.has(t.id)) errors.push(`Duplicate task.id: ${t.id}`)
    seenIds.add(t.id)
}

// 2. Every task.group exists
for (const t of TASKS) {
    if (!GROUPS[t.group]) {
        errors.push(`Task ${t.id} references unknown group: ${t.group}`)
    }
}

// 3. Every task.role in ROLES or '*'
const validRoles = new Set([...ROLES, '*'])
for (const t of TASKS) {
    if (!validRoles.has(t.role)) {
        errors.push(`Task ${t.id} has invalid role: ${t.role}`)
    }
}

// 4. relatedTasks / prerequisites reference real tasks
for (const t of TASKS) {
    for (const rel of (t.relatedTasks || [])) {
        if (!seenIds.has(rel)) {
            errors.push(`Task ${t.id} relatedTasks references unknown: ${rel}`)
        }
    }
    for (const pre of (t.prerequisites || [])) {
        if (!seenIds.has(pre)) {
            errors.push(`Task ${t.id} prerequisites references unknown: ${pre}`)
        }
    }
}

// 5. getting-started and support have roles: ['*']
for (const groupId of ['getting-started', 'support']) {
    const g = GROUPS[groupId]
    if (!g || !g.roles.includes('*')) {
        errors.push(`Group ${groupId} must have roles: ['*']`)
    }
}

// 6. task.component is a function; its import path points to an existing file
//    Extract the path via regex on the arrow-function source. Node cannot
//    execute the dynamic import (JSX needs Vite), so we check statically.
const IMPORT_RE = /import\(\s*['"]([^'"]+)['"]\s*\)/
for (const t of TASKS) {
    if (typeof t.component !== 'function') {
        errors.push(`Task ${t.id}.component must be a () => import(...) function`)
        continue
    }
    const src = t.component.toString()
    const match = src.match(IMPORT_RE)
    if (!match) {
        errors.push(`Task ${t.id}.component has no recognizable import path`)
        continue
    }
    const absPath = resolve(MANIFEST_DIR, match[1])
    if (!existsSync(absPath)) {
        errors.push(`Task ${t.id}.component path does not exist on disk: ${match[1]} → ${absPath}`)
    }
}

if (errors.length > 0) {
    console.error('\n❌ Manifest validation failed:\n')
    errors.forEach(e => console.error(`  • ${e}`))
    console.error('')
    process.exit(1)
}

console.log(`✔ Manifest valid — ${TASKS.length} tasks across ${Object.keys(GROUPS).length} groups`)
