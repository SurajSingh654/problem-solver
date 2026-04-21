import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import '@excalidraw/excalidraw/index.css'

export function ExcalidrawEditor({ onChange, initialData, theme }) {
    const [ExcalidrawComponent, setExcalidrawComponent] = useState(null)
    const [loadError, setLoadError] = useState(false)
    const containerRef = useRef(null)
    const debounceRef = useRef(null)
    const onChangeRef = useRef(onChange)
    const excalidrawAPIRef = useRef(null)
    const isMountedRef = useRef(true)

    // Keep onChange ref fresh without causing re-renders
    useEffect(() => {
        onChangeRef.current = onChange
    }, [onChange])

    // Track mounted state to prevent updates after unmount
    useEffect(() => {
        isMountedRef.current = true
        return () => {
            isMountedRef.current = false
        }
    }, [])

    // Dynamic import on mount with error handling
    useEffect(() => {
        import('@excalidraw/excalidraw')
            .then(mod => {
                if (isMountedRef.current) {
                    setExcalidrawComponent(() => mod.Excalidraw)
                }
            })
            .catch(err => {
                console.error('Failed to load Excalidraw:', err)
                if (isMountedRef.current) {
                    setLoadError(true)
                }
            })
    }, [])

    // Debounced change handler — avoids infinite re-render loop
    const handleChange = useCallback((elements) => {
        if (debounceRef.current) clearTimeout(debounceRef.current)

        debounceRef.current = setTimeout(() => {
            if (!isMountedRef.current) return
            const nonDeleted = elements.filter(el => !el.isDeleted)
            if (onChangeRef.current && nonDeleted.length > 0) {
                onChangeRef.current(JSON.stringify(nonDeleted))
            }
        }, 300)
    }, [])

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
        }
    }, [])

    // Call refresh() when container becomes visible (tab switching)
    useEffect(() => {
        if (!excalidrawAPIRef.current || !containerRef.current) return

        const observer = new ResizeObserver(() => {
            if (excalidrawAPIRef.current && containerRef.current?.offsetHeight > 0) {
                excalidrawAPIRef.current.refresh()
            }
        })

        observer.observe(containerRef.current)
        return () => observer.disconnect()
    }, [ExcalidrawComponent])

    // Capture excalidrawAPI for imperative access
    const handleExcalidrawAPI = useCallback((api) => {
        excalidrawAPIRef.current = api
    }, [])

    // Parse initial elements with validation — only once
    const parsedInitialData = useMemo(() => {
        if (!initialData) return { elements: [] }
        try {
            const parsed = JSON.parse(initialData)
            // Validate it's an array of objects with required shape
            if (Array.isArray(parsed) && parsed.every(el => el.type && el.id)) {
                return { elements: parsed }
            }
            return { elements: [] }
        } catch {
            return { elements: [] }
        }
    }, [initialData])

    // Detect theme — prefer explicit prop, fallback to DOM class
    const resolvedTheme = theme
        || (typeof document !== 'undefined'
            && (document.documentElement.classList.contains('dark')
                || !document.documentElement.classList.contains('light'))
            ? 'dark'
            : 'light')

    // Error state — graceful fallback
    if (loadError) {
        return (
            <div className="flex flex-col items-center justify-center h-full
                      text-xs text-text-tertiary gap-2 p-4">
                <span>Failed to load whiteboard.</span>
                <button
                    onClick={() => {
                        setLoadError(false)
                        import('@excalidraw/excalidraw')
                            .then(mod => {
                                if (isMountedRef.current) {
                                    setExcalidrawComponent(() => mod.Excalidraw)
                                }
                            })
                            .catch(() => setLoadError(true))
                    }}
                    className="text-brand-400 hover:text-brand-300 underline"
                >
                    Retry
                </button>
            </div>
        )
    }

    // Loading state
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

    return (
        <div
            ref={containerRef}
            style={{ width: '100%', height: '100%', minHeight: '400px' }}
        >
            <ExcalidrawComponent
                excalidrawAPI={handleExcalidrawAPI}
                initialData={parsedInitialData}
                onChange={handleChange}
                theme={resolvedTheme}
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