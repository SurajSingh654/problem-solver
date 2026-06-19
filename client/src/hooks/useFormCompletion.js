import { useMemo } from 'react'

// Required-field tracking per category. Drives the sticky bar's progress
// bar + summary line. Single source so the bar's two readouts can't drift.

const isFilled = (s) => typeof s === 'string' && s.trim().length > 0

function bruteForceFilled(fs) { return isFilled(fs.bruteForceMeta?.code) }
function optimizedFilled(fs)  { return isFilled(fs.code) }
function alternativeFilled(fs){ return isFilled(fs.alternativeMeta?.code) }
function anyTabFilled(fs)     { return bruteForceFilled(fs) || optimizedFilled(fs) || alternativeFilled(fs) }

// Each category returns an ordered list of required-field checks, evaluated
// against the form state. Order matters — the FIRST unfilled check becomes
// the "Set X next" pointer in the sticky bar.
const REQUIREMENTS = {
  CODING: (fs) => [
    { label: 'confidence',           filled: fs.confidence != null },
    { label: 'a pattern',            filled: Array.isArray(fs.patterns) && fs.patterns.length > 0 },
    { label: 'your code',            filled: anyTabFilled(fs) },
  ],
  HR: (fs) => [
    { label: 'confidence',           filled: fs.confidence != null },
    { label: 'the Analyze section',  filled: isFilled(fs.hrSpecific?.analyze) },
    { label: 'the Answer section',   filled: isFilled(fs.hrSpecific?.answer) },
  ],
  BEHAVIORAL: (fs) => [
    { label: 'confidence',           filled: fs.confidence != null },
    { label: 'STAR Situation',       filled: isFilled(fs.behavioralSpecific?.situation) },
    { label: 'STAR Action',          filled: isFilled(fs.behavioralSpecific?.action) },
    { label: 'STAR Result',          filled: isFilled(fs.behavioralSpecific?.result) },
  ],
  CS_FUNDAMENTALS: (fs) => [
    { label: 'confidence',           filled: fs.confidence != null },
    { label: 'a Subject',            filled: isFilled(fs.tkSpecific?.subject) },
    { label: 'the Mechanism',        filled: isFilled(fs.tkSpecific?.mechanism) },
  ],
  SQL: (fs) => [
    { label: 'confidence',           filled: fs.confidence != null },
    { label: 'your query approach',  filled: isFilled(fs.dbSpecific?.queryApproach) || isFilled(fs.dbSpecific?.schemaDesign) },
    { label: 'your code',            filled: isFilled(fs.code) },
  ],
}

/**
 * Compute required-field completion state for the current form.
 *
 * Returns:
 *   filled    — number of required fields that are populated
 *   total     — total number of required fields for this category
 *   nextField — human label of the FIRST unfilled field, or null when all done
 */
export function useFormCompletion(formState, problemCategory) {
  return useMemo(() => {
    const builder = REQUIREMENTS[problemCategory] || REQUIREMENTS.CODING
    const checks = builder(formState || {})
    const filled = checks.filter((c) => c.filled).length
    const next = checks.find((c) => !c.filled)
    return {
      filled,
      total: checks.length,
      nextField: next?.label ?? null,
    }
  }, [formState, problemCategory])
}
