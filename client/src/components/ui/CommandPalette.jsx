import {
  useState, useEffect, useRef, useMemo
} from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useUIStore } from '@store/useUIStore'
import useAuthStore from '@store/useAuthStore'
import { Badge } from '@components/ui/Badge'
import { cn } from '@utils/cn'

const DIFF_VARIANT = { EASY: 'easy', MEDIUM: 'medium', HARD: 'hard' }

// ── Commands for team members ──────────────────────────
function useTeamCommands(isTeamAdmin, navigate, close) {
  return [
    {
      group: 'Navigate',
      items: [
        { label: 'Dashboard', shortcut: 'G D', icon: '🏠', action: () => { navigate('/'); close() } },
        { label: 'Problems', shortcut: 'G P', icon: '📋', action: () => { navigate('/problems'); close() } },
        { label: 'Mock Interview', shortcut: 'G I', icon: '💬', action: () => { navigate('/mock-interview'); close() } },
        { label: 'Review Queue', shortcut: 'G R', icon: '🧠', action: () => { navigate('/review'); close() } },
        { label: 'Quizzes', shortcut: 'G Q', icon: '🧩', action: () => { navigate('/quizzes'); close() } },
        { label: 'My Report', shortcut: 'G E', icon: '📊', action: () => { navigate('/report'); close() } },
        { label: 'Leaderboard', shortcut: 'G L', icon: '🏆', action: () => { navigate('/leaderboard'); close() } },
        { label: 'My Profile', shortcut: 'G U', icon: '👤', action: () => { navigate('/profile'); close() } },
        { label: 'Settings', shortcut: 'G S', icon: '⚙️', action: () => { navigate('/settings'); close() } },
      ],
    },
    ...(isTeamAdmin ? [{
      group: 'Admin',
      items: [
        { label: 'Admin Panel', icon: '👑', action: () => { navigate('/admin'); close() } },
        { label: 'Add Problem', icon: '➕', action: () => { navigate('/admin/add-problem'); close() } },
        { label: 'Team Analytics', icon: '📊', action: () => { navigate('/admin/analytics'); close() } },
      ],
    }] : []),
    {
      group: 'Docs',
      items: [
        { label: 'README', icon: '📖', action: () => { navigate('/docs/readme'); close() } },
        { label: 'Setup Guide', icon: '🚀', action: () => { navigate('/docs/setup'); close() } },
      ],
    },
  ]
}

// ── Commands for SuperAdmin ────────────────────────────
function useSuperAdminCommands(navigate, close) {
  return [
    {
      group: 'Platform',
      items: [
        { label: 'Platform Dashboard', shortcut: 'G D', icon: '⚡', action: () => { navigate('/super-admin'); close() } },
        { label: 'All Teams', shortcut: 'G T', icon: '🏢', action: () => { navigate('/super-admin/teams'); close() } },
        { label: 'All Users', shortcut: 'G U', icon: '👥', action: () => { navigate('/super-admin/users'); close() } },
        { label: 'Platform Analytics', shortcut: 'G A', icon: '📊', action: () => { navigate('/super-admin/analytics'); close() } },
        { label: 'Settings', shortcut: 'G S', icon: '⚙️', action: () => { navigate('/super-admin/settings'); close() } },
        { label: 'My Profile', icon: '👤', action: () => { navigate('/super-admin/profile'); close() } },
      ],
    },
  ]
}

export function CommandPalette() {
  const { commandPaletteOpen, closeCommandPalette } = useUIStore()
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const isSuperAdmin = user?.globalRole === 'SUPER_ADMIN'
  const isTeamAdmin = user?.teamRole === 'TEAM_ADMIN'

  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  // Only fetch problems for team users — SuperAdmin has no team context
  const shouldLoadProblems = !isSuperAdmin && commandPaletteOpen
  const [allProblems, setAllProblems] = useState([])

  useEffect(() => {
    if (!shouldLoadProblems) {
      setAllProblems([])
      return
    }
    let cancelled = false
    async function load() {
      try {
        const api = (await import('@services/api')).default
        const res = await api.get('/problems', { params: { page: 1, limit: 200 } })
        if (!cancelled) {
          setAllProblems(res.data.problems || [])
        }
      } catch {
        // Silently fail — command palette search is best-effort
      }
    }
    load()
    return () => { cancelled = true }
  }, [shouldLoadProblems])

  const commands = isSuperAdmin
    ? useSuperAdminCommands(navigate, closeCommandPalette)
    : useTeamCommands(isTeamAdmin, navigate, closeCommandPalette)

  // Build results — split into nav commands and problem results
  const { navGroups, problemResults } = useMemo(() => {
    const q = query.trim().toLowerCase()

    if (!q) {
      return { navGroups: commands, problemResults: [] }
    }

    // Filter nav commands
    const navGroups = commands
      .map(group => ({
        ...group,
        items: group.items.filter(item =>
          item.label.toLowerCase().includes(q)
        ),
      }))
      .filter(group => group.items.length > 0)

    // Filter problems (only for team users)
    const problemResults = isSuperAdmin ? [] : allProblems
      .filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.tags?.some(t => t.toLowerCase().includes(q))
      )
      .slice(0, 6)

    return { navGroups, problemResults }
  }, [query, commands, allProblems, isSuperAdmin])

  // Flat list for keyboard nav — nav items first, then problems
  const flatItems = useMemo(() => {
    const navItems = navGroups.flatMap(g => g.items)
    const problemItems = problemResults.map(p => ({
      label: p.title,
      isProblem: true,
      problem: p,
      action: () => { navigate(`/problems/${p.id}`); closeCommandPalette() },
    }))
    return [...navItems, ...problemItems]
  }, [navGroups, problemResults])

  // Reset on open
  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('')
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [commandPaletteOpen])

  // Global keyboard handler
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        commandPaletteOpen
          ? closeCommandPalette()
          : useUIStore.getState().openCommandPalette()
        return
      }
      if (!commandPaletteOpen) return

      if (e.key === 'Escape') {
        closeCommandPalette()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelected(s => Math.min(s + 1, flatItems.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelected(s => Math.max(s - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        flatItems[selected]?.action()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [commandPaletteOpen, flatItems, selected, closeCommandPalette])

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-selected="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  useEffect(() => { setSelected(0) }, [query])

  // Running index for flat keyboard nav
  let runningIdx = -1

  return (
    <AnimatePresence>
      {commandPaletteOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-modal bg-black/60 backdrop-blur-sm"
            onClick={closeCommandPalette}
          />

          {/* Palette */}
          <div className="fixed inset-0 z-modal flex items-start justify-center
                          pt-[15vh] px-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -16 }}
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              className="w-full max-w-xl bg-surface-2 border border-border-strong
                         rounded-2xl shadow-xl overflow-hidden"
            >
              {/* Search input */}
              <div className="flex items-center gap-3 px-4 py-3.5
                              border-b border-border-default">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"
                  className="text-text-tertiary flex-shrink-0">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={isSuperAdmin
                    ? "Search pages, actions…"
                    : "Search pages, problems, actions…"
                  }
                  className="flex-1 bg-transparent outline-none text-sm
                             text-text-primary placeholder:text-text-tertiary
                             caret-brand-400"
                />
                <kbd className="text-[11px] text-text-disabled bg-surface-3
                                border border-border-default rounded px-1.5 py-0.5
                                font-mono flex-shrink-0">
                  ESC
                </kbd>
              </div>

              {/* Results */}
              <div
                ref={listRef}
                className="max-h-[400px] overflow-y-auto py-2 no-scrollbar"
              >
                {flatItems.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-12 text-center">
                    <div className="text-3xl">🔍</div>
                    <p className="text-sm text-text-tertiary">
                      No results for{' '}
                      <span className="text-text-secondary font-medium">
                        "{query}"
                      </span>
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Nav groups */}
                    {navGroups.map(group => (
                      <div key={group.group} className="mb-1">
                        <p className="px-4 py-1.5 text-[10px] font-bold
                                      text-text-disabled uppercase tracking-widest">
                          {group.group}
                        </p>
                        {group.items.map(item => {
                          runningIdx++
                          const idx = runningIdx
                          const isSelected = idx === selected
                          return (
                            <button
                              key={item.label}
                              data-selected={isSelected}
                              onClick={item.action}
                              onMouseEnter={() => setSelected(idx)}
                              className={cn(
                                'w-full flex items-center gap-3 px-4 py-2.5',
                                'text-sm transition-colors text-left',
                                isSelected
                                  ? 'bg-brand-400/12 text-brand-300'
                                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-3'
                              )}
                            >
                              <span className="w-7 h-7 flex-shrink-0 flex items-center
                                               justify-center rounded-lg text-base bg-surface-3">
                                {item.icon}
                              </span>
                              <span className="flex-1 font-medium">{item.label}</span>
                              {item.shortcut && (
                                <span className="flex gap-1 items-center flex-shrink-0">
                                  {item.shortcut.split(' ').map((k, i) => (
                                    <kbd key={i}
                                      className="text-[10px] font-mono text-text-disabled
                                                    bg-surface-3 border border-border-default
                                                    rounded px-1.5 py-px">
                                      {k}
                                    </kbd>
                                  ))}
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    ))}

                    {/* Problem results (team users only) */}
                    {problemResults.length > 0 && (
                      <div className="mb-1">
                        <p className="px-4 py-1.5 text-[10px] font-bold
                                      text-text-disabled uppercase tracking-widest">
                          Problems
                        </p>
                        {problemResults.map(problem => {
                          runningIdx++
                          const idx = runningIdx
                          const isSelected = idx === selected
                          return (
                            <button
                              key={problem.id}
                              data-selected={isSelected}
                              onClick={() => {
                                navigate(`/problems/${problem.id}`)
                                closeCommandPalette()
                              }}
                              onMouseEnter={() => setSelected(idx)}
                              className={cn(
                                'w-full flex items-center gap-3 px-4 py-2.5',
                                'text-sm transition-colors text-left',
                                isSelected
                                  ? 'bg-brand-400/12 text-brand-300'
                                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-3'
                              )}
                            >
                              {/* Solved indicator */}
                              <div className={cn(
                                'w-7 h-7 flex-shrink-0 flex items-center justify-center',
                                'rounded-lg text-base',
                                problem.isSolved
                                  ? 'bg-success/15'
                                  : 'bg-surface-3'
                              )}>
                                {problem.isSolved ? (
                                  <svg width="13" height="13" viewBox="0 0 24 24"
                                    fill="none" stroke="#22c55e" strokeWidth="3"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                ) : (
                                  <span className="text-sm">📋</span>
                                )}
                              </div>
                              {/* Title + tags */}
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{problem.title}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {problem.tags?.slice(0, 2).map(t => (
                                    <span key={t}
                                      className="text-[10px] text-text-disabled">
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              {/* Difficulty badge */}
                              <Badge
                                variant={DIFF_VARIANT[problem.difficulty] || 'brand'}
                                size="xs"
                                className="flex-shrink-0"
                              >
                                {problem.difficulty.charAt(0) +
                                  problem.difficulty.slice(1).toLowerCase()}
                              </Badge>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center gap-4 px-4 py-2.5
                              border-t border-border-default bg-surface-1">
                {[
                  { keys: ['↑', '↓'], label: 'Navigate' },
                  { keys: ['↵'], label: 'Select' },
                  { keys: ['ESC'], label: 'Close' },
                ].map(hint => (
                  <div key={hint.label}
                    className="flex items-center gap-1.5 text-[11px] text-text-disabled">
                    {hint.keys.map(k => (
                      <kbd key={k}
                        className="font-mono bg-surface-3 border border-border-default
                                      rounded px-1.5 py-px text-[11px]">
                        {k}
                      </kbd>
                    ))}
                    <span>{hint.label}</span>
                  </div>
                ))}
                {!isSuperAdmin && allProblems.length > 0 && (
                  <span className="ml-auto text-[11px] text-text-disabled">
                    {allProblems.length} problems indexed
                  </span>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}