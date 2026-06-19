// Centralized lucide-react icon mapping for the Submit Solution page.
// Single source of truth for the emoji → lucide swap; rename in one place.

import {
  Handshake, MessageSquare, Target, Brain, Zap, Search, Pencil, Eye,
  Snowflake, Lightbulb, Sparkles, Lock, Scale, Check, X, CircleDashed,
  AlertTriangle, Info, ChevronDown, Layers, Activity, Mic, Briefcase,
  FlaskConical, Database, Code2, FileText, BookOpen, Frown, Smile, Meh,
  Annoyed, Flame, BarChart2, HelpCircle, Compass, NotebookPen,
} from 'lucide-react'

// Map a semantic label to a lucide icon component. Callers render the
// returned component themselves (so they can size / color it).
//
// The label key is the *concept* the icon represents, NOT the original
// emoji. e.g. "solve-method-cold" not "snowflake". Future emoji renames
// don't break callers.
export const SUBMIT_ICONS = {
  // Section headers
  'section-hr': Handshake,
  'section-behavioral': MessageSquare,
  'section-technical-knowledge': Brain,
  'section-database': Database,
  'section-coding': Code2,
  'section-confidence': Target,
  'section-patterns': Layers,
  'section-solve-method': Activity,
  'section-followup': MessageSquare,
  'section-mock-interview': Mic,
  'section-system-design': Briefcase,
  'section-low-level-design': FlaskConical,
  'section-chart': BarChart2,
  'section-key-insight': Lightbulb,
  'section-explain-simply': NotebookPen,
  'section-challenges': HelpCircle,
  'section-approach': Compass,

  // Solve method
  'solve-method-cold':         Snowflake,
  'solve-method-hints':        Lightbulb,
  'solve-method-saw-approach': Eye,

  // Confidence (1-5)
  'confidence-1': Frown,
  'confidence-2': Annoyed,
  'confidence-3': Meh,
  'confidence-4': Smile,
  'confidence-5': Flame,

  // HR workspace tabs
  'hr-tab-analyze': Search,
  'hr-tab-answer':  Pencil,
  'hr-tab-tailor':  Target,
  'hr-tab-reflect': Eye,

  // Common chrome
  'ai-hint':       Sparkles,
  'read-only':     Lock,
  'expand-down':   ChevronDown,
  'check':         Check,
  'partial':       CircleDashed,
  'fail':          X,
  'tone-warning':  AlertTriangle,
  'tone-info':     Info,
  'tone-scale':    Scale,
  'docs':          FileText,
  'book':          BookOpen,
  'fast':          Zap,
}

/**
 * Render a lucide icon for a semantic label. Returns null if the label
 * isn't mapped — callers can fall back to text or skip the icon.
 *
 * Usage:
 *   import { iconForLabel } from "@/components/features/submit/icons"
 *   const Icon = iconForLabel('section-hr')
 *   return <Icon className="w-4 h-4" aria-hidden="true" />
 */
export function iconForLabel(label) {
  return SUBMIT_ICONS[label] ?? null
}

/**
 * Map an internal tab payload key (BRUTE_FORCE / OPTIMIZED / ALTERNATIVE)
 * to a user-friendly display label. Decoupled from the field name so we
 * can change the visible label without touching the request payload.
 */
const TAB_LABELS = {
  BRUTE_FORCE: 'Initial',
  OPTIMIZED:   'Refined',
  ALTERNATIVE: 'Alternative',
}
export function tabLabel(internalKey) {
  return TAB_LABELS[internalKey] || internalKey
}
