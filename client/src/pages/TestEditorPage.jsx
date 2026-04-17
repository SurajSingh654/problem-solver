import { useState } from 'react'
import { RichTextEditor } from '@components/ui/RichTextEditor'
import { CodeEditor } from '@components/ui/CodeEditor'

export default function TestEditorPage() {
    const [notes, setNotes] = useState('')
    const [code, setCode] = useState('// Write your solution here\n\ndef twoSum(nums, target):\n    seen = {}\n    for i, num in enumerate(nums):\n        comp = target - num\n        if comp in seen:\n            return [seen[comp], i]\n        seen[num] = i\n    return []\n')
    const [language, setLanguage] = useState('PYTHON')

    return (
        <div className="p-8 max-w-[800px] mx-auto space-y-8">
            <h1 className="text-xl font-bold text-text-primary">
                Editor Components Test
            </h1>

            {/* Rich Text Editor */}
            <div>
                <h2 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
                    <span>📝</span> Rich Text Editor (Tiptap)
                </h2>
                <RichTextEditor
                    label="Notes"
                    hint="Try bold, italic, bullet lists, quotes, inline code..."
                    placeholder="Start typing to test the editor..."
                    content={notes}
                    onChange={setNotes}
                    minHeight="150px"
                />
                <details className="mt-3">
                    <summary className="text-xs text-text-tertiary cursor-pointer
                              hover:text-text-primary transition-colors">
                        Show HTML output
                    </summary>
                    <pre className="bg-surface-2 border border-border-default rounded-xl p-3
                          text-xs font-mono text-text-tertiary overflow-x-auto
                          max-h-[150px] mt-2">
                        {notes || '<empty>'}
                    </pre>
                </details>
            </div>

            {/* Code Editor */}
            <div>
                <h2 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
                    <span>💻</span> Code Editor (Monaco)
                </h2>
                <CodeEditor
                    label="Solution Code"
                    hint="Full VS Code editor with syntax highlighting"
                    code={code}
                    onChange={setCode}
                    language={language}
                    onLanguageChange={setLanguage}
                    height="300px"
                />
                <details className="mt-3">
                    <summary className="text-xs text-text-tertiary cursor-pointer
                              hover:text-text-primary transition-colors">
                        Show raw code
                    </summary>
                    <pre className="bg-surface-2 border border-border-default rounded-xl p-3
                          text-xs font-mono text-text-tertiary overflow-x-auto
                          max-h-[150px] mt-2">
                        {code || '<empty>'}
                    </pre>
                </details>
            </div>
        </div>
    )
}