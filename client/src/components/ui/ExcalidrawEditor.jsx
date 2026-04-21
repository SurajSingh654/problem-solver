import { useState, useCallback } from 'react'

// Lazy load Excalidraw to avoid SSR issues and reduce initial bundle
let Excalidraw = null

export function ExcalidrawEditor({ onChange, initialData }) {
    const [loaded, setLoaded] = useState(false)
    const [ExcalidrawComponent, setExcalidrawComponent] = useState(null)

    // Dynamic import on first render
    useState(() => {
        import('@excalidraw/excalidraw').then(mod => {
            Excalidraw = mod.Excalidraw
            setExcalidrawComponent(() => mod.Excalidraw)
            setLoaded(true)
        })
    })

    const handleChange = useCallback((elements, appState) => {
        // Serialize elements to JSON string for storage
        if (onChange && elements.length > 0) {
            const serialized = JSON.stringify(elements)
            onChange(serialized)
        }
    }, [onChange])

    if (!loaded || !ExcalidrawComponent) {
        return (
            <div className="flex items-center justify-center h-full
                      text-xs text-text-tertiary gap-2">
                <div className="w-4 h-4 rounded-full border-2 border-brand-400
                        border-t-transparent animate-spin" />
                Loading whiteboard...
            </div>
        )
    }

    // Parse initial data if it's a JSON string of elements
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
        <div className="h-full w-full" style={{ minHeight: '400px' }}>
            <ExcalidrawComponent
                initialData={{ elements: initialElements }}
                onChange={handleChange}
                theme={isDark ? "dark" : "light"}
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