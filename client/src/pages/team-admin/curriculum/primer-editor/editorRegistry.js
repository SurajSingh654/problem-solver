// type → per-section editor component. Kept separate from
// `SectionEditors.jsx` because Fast Refresh requires component files
// to export components only (a constant re-export would trip the
// react-refresh rule and break HMR on the editors module).
import {
    ObjectivesEditor,
    PrerequisitesEditor,
    MentalModelEditor,
    BodyEditor,
    WorkedExampleEditor,
    CheckYourselfEditor,
    CheatsheetEditor,
    CodeReferenceEditor,
    DiagramEditor,
    ComparisonEditor,
    GotchasEditor,
    ComplexityEditor,
} from './SectionEditors'

export const EDITOR_REGISTRY = {
    objectives:    ObjectivesEditor,
    prerequisites: PrerequisitesEditor,
    mentalModel:   MentalModelEditor,
    body:          BodyEditor,
    workedExample: WorkedExampleEditor,
    checkYourself: CheckYourselfEditor,
    cheatsheet:    CheatsheetEditor,
    codeReference: CodeReferenceEditor,
    diagram:       DiagramEditor,
    comparison:    ComparisonEditor,
    gotchas:       GotchasEditor,
    complexity:    ComplexityEditor,
}
