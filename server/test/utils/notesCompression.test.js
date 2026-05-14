import { describe, it, expect } from 'vitest'
import { prepareNoteContentForAi } from '../../src/utils/notesCompression.js'

describe('prepareNoteContentForAi', () => {
    it('returns content unchanged when below threshold', () => {
        const md = '# Short note\n\nJust a paragraph.'
        const r = prepareNoteContentForAi(md)
        expect(r.wasCompressed).toBe(false)
        expect(r.content).toBe(md)
        expect(r.originalChars).toBe(md.length)
    })

    it('compresses long notes by section', () => {
        const sections = []
        for (let i = 0; i < 10; i++) {
            sections.push(`## Section ${i}`)
            sections.push('Lead prose for this section. '.repeat(40))
            sections.push('- bullet a')
            sections.push('- bullet b')
            sections.push('- bullet c')
            sections.push('```')
            sections.push('long code block content '.repeat(30))
            sections.push('```')
        }
        const md = sections.join('\n')
        expect(md.length).toBeGreaterThan(6000)

        const r = prepareNoteContentForAi(md)
        expect(r.wasCompressed).toBe(true)
        expect(r.finalChars).toBeLessThan(r.originalChars)
        // All section headings preserved
        for (let i = 0; i < 10; i++) {
            expect(r.content).toContain(`## Section ${i}`)
        }
        // Bullets preserved
        expect(r.content).toContain('- bullet a')
        // Code blocks collapsed to placeholder
        expect(r.content).toContain('[code]')
        expect(r.content).not.toContain('long code block content long code block content')
    })

    it('caps total output at the target', () => {
        // 50 sections of 200-char prose — extracts pile up
        const md = Array.from({ length: 50 }, (_, i) =>
            `# Section ${i}\n${'lorem ipsum '.repeat(80)}`,
        ).join('\n\n')
        const r = prepareNoteContentForAi(md)
        expect(r.wasCompressed).toBe(true)
        expect(r.finalChars).toBeLessThanOrEqual(4700)
    })

    it('handles empty input', () => {
        const r = prepareNoteContentForAi('')
        expect(r.wasCompressed).toBe(false)
        expect(r.content).toBe('')
    })

    it('handles content without headings (still compresses)', () => {
        const md = 'paragraph '.repeat(800)
        const r = prepareNoteContentForAi(md)
        expect(r.wasCompressed).toBe(true)
        expect(r.finalChars).toBeLessThan(r.originalChars)
    })
})
