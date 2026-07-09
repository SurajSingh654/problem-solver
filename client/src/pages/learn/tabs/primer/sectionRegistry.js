// ============================================================================
// sectionRegistry.js — section-type → renderer component map
// ============================================================================
//
// Keys mirror the discriminated union in
// server/src/schemas/curriculum.schema.js and the spec at
// docs/superpowers/specs/2026-07-09-primer-section-model-design.md.
//
// Client can lag server by one deploy — an unknown section type doesn't
// crash the page, it falls back to a rendered warning (see the fallback
// in PrimerSectionRenderer). Adding a new type is a two-step: add here +
// add to the server Zod discriminated union.
// ============================================================================

import ObjectivesSection from './sections/ObjectivesSection'
import PrerequisitesSection from './sections/PrerequisitesSection'
import MentalModelSection from './sections/MentalModelSection'
import BodySection from './sections/BodySection'
import WorkedExampleSection from './sections/WorkedExampleSection'
import CheckYourselfSection from './sections/CheckYourselfSection'
import CheatsheetSection from './sections/CheatsheetSection'
import CodeReferenceSection from './sections/CodeReferenceSection'
import DiagramSection from './sections/DiagramSection'
import ComparisonSection from './sections/ComparisonSection'
import GotchasSection from './sections/GotchasSection'
import ComplexitySection from './sections/ComplexitySection'

export const sectionRegistry = {
    objectives:     ObjectivesSection,
    prerequisites:  PrerequisitesSection,
    mentalModel:    MentalModelSection,
    body:           BodySection,
    workedExample:  WorkedExampleSection,
    checkYourself:  CheckYourselfSection,
    cheatsheet:     CheatsheetSection,
    codeReference:  CodeReferenceSection,
    diagram:        DiagramSection,
    comparison:     ComparisonSection,
    gotchas:        GotchasSection,
    complexity:     ComplexitySection,
}
