import { useState, useCallback, useEffect, useRef } from 'react'
import '@excalidraw/excalidraw/index.css'

export function ExcalidrawEditor({ onChange, initialData }) {
    const [ExcalidrawComponent, setExcalidrawComponent] = useState(null)
    const containerRef = useRef(null)

    // Dynamic import on mount
    useEffect(() => {
        import('@excalidraw/excalidraw').then(mod => {
            setExcalidrawComponent(() => mod.Excalidraw)
        })
    }, [])

    const handleChange = useCallback((elements) => {
        if (onChange && elements.length > 0) {
            const serialized = JSON.stringify(elements)
            onChange(serialized)
        }
    }, [onChange])

    if (!ExcalidrawComponent) {
        return (
            <div className="flex items-center justify-center h-full
                      text-xs text-text-tertiary gap-2">
                <div className="w-4 h-4 rounded-full border-2 border-brand-400
                        border-t-transparent animate-spin" />
                Loading whiteboard...
            </div>
        )
    }

    let initialElements = []
    if (initialData) {
        try {
            initialElements = JSON.parse(initialData)
        } catch {
            // Not valid JSON, ignore
        }
    }

    const isDark = typeof document !== 'undefined'
        ? document.documentElement.classList.contains('dark') ||
        !document.documentElement.classList.contains('light')
        : true

    return (
        <div
            ref={containerRef}
            style={{ width: '100%', height: '100%', minHeight: '400px' }}
        >
            <ExcalidrawComponent
                initialData={{ elements: initialElements }}
                onChange={handleChange}
                theme={isDark ? 'dark' : 'light'}
                UIOptions={{
                    canvasActions: {
                        export: false,
                        loadScene: false,
                        saveToActiveFile: false,
                    },
                }}
            />
        </div>
    )
}