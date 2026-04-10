import { useState, useEffect }     from 'react'
import { useParams, useNavigate }  from 'react-router-dom'
import { useForm }                 from 'react-hook-form'
import { motion, AnimatePresence } from 'framer-motion'
import { useProblem }              from '@hooks/useProblems'
import { useCreateSolution }       from '@hooks/useSolutions'
import { Button }                  from '@components/ui/Button'
import { PageSpinner }             from '@components/ui/Spinner'
import { Badge }                   from '@components/ui/Badge'
import { cn }                      from '@utils/cn'
import {
  PATTERNS, LANGUAGE, LANGUAGE_LABELS,
  CONFIDENCE_LEVELS,
} from '@utils/constants'

const DIFF_VARIANT = { EASY: 'easy', MEDIUM: 'medium', HARD: 'hard' }
const SOURCE_LABELS = {
  LEETCODE: 'LeetCode', GFG: 'GFG', CODECHEF: 'CodeChef',
  INTERVIEWBIT: 'InterviewBit', HACKERRANK: 'HackerRank',
  CODEFORCES: 'Codeforces', OTHER: 'Other',
}

const STEPS = [
  { id: 1, label: 'Pattern',    icon: '🧩', desc: 'How did you recognize the approach?' },
  { id: 2, label: 'Approach',   icon: '⚙️', desc: 'Brute force → optimized solution' },
  { id: 3, label: 'Depth',      icon: '🔬', desc: 'Insights, explanations & follow-ups' },
  { id: 4, label: 'Assessment', icon: '📊', desc: 'Self-rate your performance' },
]

// ── Shared field components ────────────────────────────
function FieldLabel({ children, optional = false }) {
  return (
    <label className="block text-sm font-semibold text-text-primary mb-1.5">
      {children}
      {optional && (
        <span className="ml-1.5 text-xs font-normal text-text-disabled">
          optional
        </span>
      )}
    </label>
  )
}

function Textarea({ label, optional, hint, error, rows = 3, ...props }) {
  return (
    <div>
      {label && <FieldLabel optional={optional}>{label}</FieldLabel>}
      {hint && (
        <p className="text-xs text-text-tertiary mb-2">{hint}</p>
      )}
      <textarea
        rows={rows}
        className={cn(
          'w-full bg-surface-3 border border-border-strong rounded-xl',
          'text-sm text-text-primary placeholder:text-text-tertiary',
          'px-3.5 py-2.5 outline-none resize-none',
          'transition-all duration-150',
          'focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20',
          error && 'border-danger focus:border-danger focus:ring-danger/20'
        )}
        {...props}
      />
      {error && (
        <p className="text-xs text-danger mt-1 flex items-center gap-1">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2.5"
               strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
        </p>
      )}
    </div>
  )
}

function ComplexityInput({ label, placeholder, value, onChange }) {
  const suggestions = ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n²)', 'O(2ⁿ)', 'O(n!)']
  return (
    <div>
      <FieldLabel optional>{label}</FieldLabel>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || 'e.g. O(n)'}
          className={cn(
            'w-full bg-surface-3 border border-border-strong rounded-xl',
            'text-sm font-mono text-text-primary placeholder:text-text-tertiary',
            'px-3.5 py-2.5 outline-none',
            'focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20',
            'transition-all duration-150'
          )}
        />
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {suggestions.map(s => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className={cn(
              'text-[11px] font-mono px-2 py-0.5 rounded-lg border transition-all',
              value === s
                ? 'bg-brand-400/15 border-brand-400/40 text-brand-300'
                : 'bg-surface-3 border-border-subtle text-text-tertiary hover:text-text-primary hover:border-border-strong'
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Step indicator ─────────────────────────────────────
function StepIndicator({ current, steps, onStepClick, completedSteps }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((step, i) => {
        const isActive    = step.id === current
        const isCompleted = completedSteps.has(step.id)
        const isPast      = step.id < current
        const isClickable = isPast || isCompleted

        return (
          <div key={step.id} className="flex items-center flex-1">
            <button
              type="button"
              onClick={() => isClickable && onStepClick(step.id)}
              disabled={!isClickable && !isActive}
              className={cn(
                'flex flex-col items-center gap-1.5 flex-1 transition-all',
                isClickable ? 'cursor-pointer' : 'cursor-default'
              )}
            >
              <div className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center',
                'text-sm font-bold border-2 transition-all duration-200',
                isActive
                  ? 'bg-brand-400 border-brand-400 text-white shadow-glow-sm scale-110'
                  : isCompleted || isPast
                    ? 'bg-success/15 border-success text-success'
                    : 'bg-surface-3 border-border-default text-text-disabled'
              )}>
                {isCompleted && !isActive ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" strokeWidth="3"
                       strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                ) : (
                  <span>{step.icon}</span>
                )}
              </div>
              <span className={cn(
                'text-[11px] font-semibold hidden sm:block',
                isActive ? 'text-brand-300' : isPast || isCompleted ? 'text-success' : 'text-text-disabled'
              )}>
                {step.label}
              </span>
            </button>
            {/* Connector line */}
            {i < steps.length - 1 && (
              <div className={cn(
                'h-0.5 flex-1 mx-1 rounded-full transition-all duration-300',
                step.id < current ? 'bg-success' : 'bg-surface-4'
              )} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Step 1: Pattern ────────────────────────────────────
function StepPattern({ form }) {
  const { watch, setValue, register, formState: { errors } } = form
  const selectedPattern = watch('patternIdentified')

  return (
    <div className="space-y-6">
      <div>
        <FieldLabel>Pattern Identified</FieldLabel>
        <p className="text-xs text-text-tertiary mb-3">
          What algorithm pattern does this problem use?
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {PATTERNS.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => setValue('patternIdentified',
                selectedPattern === p.label ? '' : p.label,
                { shouldDirty: true }
              )}
              className={cn(
                'text-left px-3 py-2.5 rounded-xl border text-xs font-semibold',
                'transition-all duration-150',
                selectedPattern === p.label
                  ? 'bg-brand-400/15 border-brand-400/40 text-brand-300'
                  : 'bg-surface-3 border-border-default text-text-secondary hover:border-brand-400/30 hover:text-text-primary'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {/* Custom pattern input */}
        <div className="mt-3">
          <input
            type="text"
            placeholder="Or type a custom pattern…"
            value={!PATTERNS.some(p => p.label === selectedPattern) ? selectedPattern || '' : ''}
            onChange={e => setValue('patternIdentified', e.target.value, { shouldDirty: true })}
            className={cn(
              'w-full bg-surface-3 border border-border-strong rounded-xl',
              'text-sm text-text-primary placeholder:text-text-tertiary',
              'px-3.5 py-2.5 outline-none',
              'focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20',
              'transition-all duration-150'
            )}
          />
        </div>
      </div>

      <Textarea
        label="First Instinct"
        optional
        hint="What was your first thought when you saw this problem?"
        placeholder="e.g. I immediately noticed the sorted array and thought binary search…"
        rows={3}
        {...register('firstInstinct')}
      />

      <Textarea
        label="Why This Pattern?"
        optional
        hint="What clues in the problem pointed you to this pattern?"
        placeholder="e.g. The problem asks for a subarray sum which is a sliding window signal…"
        rows={3}
        {...register('whyThisPattern')}
      />

      <div>
        <FieldLabel optional>Time to Identify Pattern</FieldLabel>
        <p className="text-xs text-text-tertiary mb-2">
          How long did it take you to recognize the pattern? (seconds)
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          {[30, 60, 120, 180, 300, 600].map(sec => (
            <button
              key={sec}
              type="button"
              onClick={() => setValue('timeToPatternSecs',
                watch('timeToPatternSecs') === sec ? null : sec,
                { shouldDirty: true }
              )}
              className={cn(
                'px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all',
                watch('timeToPatternSecs') === sec
                  ? 'bg-brand-400/15 border-brand-400/40 text-brand-300'
                  : 'bg-surface-3 border-border-default text-text-tertiary hover:text-text-primary hover:border-border-strong'
              )}
            >
              {sec < 60 ? `${sec}s` : `${sec / 60}m`}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Step 2: Approach ───────────────────────────────────
function StepApproach({ form }) {
  const { watch, setValue, register } = form
  const [bruteTime,  setBruteTime]  = useState(watch('bruteForceTime')  || '')
  const [bruteSpace, setBruteSpace] = useState(watch('bruteForceSpace') || '')
  const [optTime,    setOptTime]    = useState(watch('optimizedTime')   || '')
  const [optSpace,   setOptSpace]   = useState(watch('optimizedSpace')  || '')
  const [predTime,   setPredTime]   = useState(watch('predictedTime')   || '')
  const [predSpace,  setPredSpace]  = useState(watch('predictedSpace')  || '')

  // Sync to form
  useEffect(() => { setValue('bruteForceTime',  bruteTime)  }, [bruteTime])
  useEffect(() => { setValue('bruteForceSpace', bruteSpace) }, [bruteSpace])
  useEffect(() => { setValue('optimizedTime',   optTime)    }, [optTime])
  useEffect(() => { setValue('optimizedSpace',  optSpace)   }, [optSpace])
  useEffect(() => { setValue('predictedTime',   predTime)   }, [predTime])
  useEffect(() => { setValue('predictedSpace',  predSpace)  }, [predSpace])

  return (
    <div className="space-y-6">
      {/* Brute force */}
      <div className="bg-surface-2 border border-border-default rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-surface-4 flex items-center justify-center text-xs">
            🐌
          </div>
          <h3 className="text-sm font-bold text-text-primary">Brute Force</h3>
          <span className="text-xs text-text-disabled">(optional)</span>
        </div>
        <Textarea
          label="Approach"
          optional
          hint="Describe your naive/brute force solution"
          placeholder="e.g. Check every pair of elements using two nested loops…"
          rows={3}
          {...register('bruteForceApproach')}
        />
        <div className="grid grid-cols-2 gap-4">
          <ComplexityInput
            label="Time Complexity"
            value={bruteTime}
            onChange={setBruteTime}
          />
          <ComplexityInput
            label="Space Complexity"
            value={bruteSpace}
            onChange={setBruteSpace}
          />
        </div>
      </div>

      {/* Optimized */}
      <div className="bg-brand-400/3 border border-brand-400/20 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-brand-400/15 flex items-center justify-center text-xs">
            ⚡
          </div>
          <h3 className="text-sm font-bold text-brand-300">Optimized Solution</h3>
        </div>
        <Textarea
          label="Approach"
          optional
          hint="Describe your optimized approach"
          placeholder="e.g. Use a hash map to store seen values, achieving O(n) lookup…"
          rows={4}
          {...register('optimizedApproach')}
        />
        <div className="grid grid-cols-2 gap-4">
          <ComplexityInput
            label="Time Complexity"
            value={optTime}
            onChange={setOptTime}
          />
          <ComplexityInput
            label="Space Complexity"
            value={optSpace}
            onChange={setOptSpace}
          />
        </div>

        {/* Predicted complexities */}
        <div className="border-t border-brand-400/15 pt-4">
          <p className="text-xs font-bold text-text-disabled uppercase tracking-widest mb-3">
            What did you predict BEFORE solving?
          </p>
          <p className="text-xs text-text-tertiary mb-3">
            Tracking prediction accuracy is a key learning signal.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <ComplexityInput
              label="Predicted Time"
              value={predTime}
              onChange={setPredTime}
            />
            <ComplexityInput
              label="Predicted Space"
              value={predSpace}
              onChange={setPredSpace}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Step 3: Depth ──────────────────────────────────────
function StepDepth({ form, followUps }) {
  const { register, watch, setValue } = form
  const followUpAnswers = watch('followUpAnswers') || []

  function setAnswer(i, val) {
    const updated = [...followUpAnswers]
    updated[i] = val
    setValue('followUpAnswers', updated, { shouldDirty: true })
  }

  return (
    <div className="space-y-6">
      <Textarea
        label="Key Insight"
        optional
        hint="One sentence — what is the core realization that makes this problem click?"
        placeholder="e.g. The trick is realizing that we only need to track the running max from the left…"
        rows={2}
        {...register('keyInsight')}
      />

      <Textarea
        label="Feynman Explanation"
        optional
        hint="Explain this solution to someone with no programming background."
        placeholder="e.g. Imagine you have a list of prices. Instead of checking every combination…"
        rows={4}
        {...register('feynmanExplanation')}
      />

      <Textarea
        label="Real World Connection"
        optional
        hint="Where does this pattern appear in real software?"
        placeholder="e.g. This sliding window approach is used in network packet analysis…"
        rows={3}
        {...register('realWorldConnection')}
      />

      {/* Follow-up questions */}
      {followUps?.length > 0 && (
        <div className="space-y-4">
          <div>
            <FieldLabel>Follow-up Questions</FieldLabel>
            <p className="text-xs text-text-tertiary">
              Answer as many as you can — these deepen your understanding.
            </p>
          </div>
          {followUps.map((fq, i) => (
            <div key={fq.id}
                 className="bg-surface-2 border border-border-default rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-surface-3
                                 border border-border-default flex items-center
                                 justify-center text-xs font-bold text-text-tertiary mt-0.5">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-sm font-medium text-text-primary leading-relaxed">
                      {fq.question}
                    </p>
                    <Badge
                      variant={DIFF_VARIANT[fq.difficulty] || 'gray'}
                      size="xs"
                      className="flex-shrink-0"
                    >
                      {fq.difficulty.charAt(0) + fq.difficulty.slice(1).toLowerCase()}
                    </Badge>
                  </div>
                  {fq.hint && (
                    <details className="mb-2">
                      <summary className="text-xs text-brand-300 cursor-pointer
                                          hover:text-brand-200 transition-colors w-fit">
                        💡 Show hint
                      </summary>
                      <p className="text-xs text-text-secondary mt-1.5 bg-surface-3
                                    border border-border-subtle rounded-lg p-2.5">
                        {fq.hint}
                      </p>
                    </details>
                  )}
                  <textarea
                    rows={2}
                    value={followUpAnswers[i] || ''}
                    onChange={e => setAnswer(i, e.target.value)}
                    placeholder="Your answer…"
                    className={cn(
                      'w-full bg-surface-3 border border-border-strong rounded-xl',
                      'text-sm text-text-primary placeholder:text-text-tertiary',
                      'px-3 py-2 outline-none resize-none',
                      'focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20',
                      'transition-all duration-150 mt-1'
                    )}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Step 4: Assessment ─────────────────────────────────
function StepAssessment({ form }) {
  const { register, watch, setValue } = form
  const confidence    = watch('confidenceLevel') || 0
  const hintsUsed     = watch('hintsUsed') || false
  const language      = watch('language') || 'PYTHON'

  return (
    <div className="space-y-6">
      {/* Confidence */}
      <div>
        <FieldLabel>Confidence Level</FieldLabel>
        <p className="text-xs text-text-tertiary mb-3">
          How well do you understand this solution right now?
        </p>
        <div className="flex gap-3 flex-wrap">
          {CONFIDENCE_LEVELS.map(c => (
            <button
              key={c.value}
              type="button"
              onClick={() => setValue('confidenceLevel', c.value, { shouldDirty: true })}
              className={cn(
                'flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl border',
                'transition-all duration-150 min-w-[80px]',
                confidence === c.value
                  ? 'bg-brand-400/15 border-brand-400/40 scale-105'
                  : 'bg-surface-3 border-border-default hover:border-border-strong'
              )}
            >
              <span className="text-2xl">{c.emoji}</span>
              <span className={cn(
                'text-[11px] font-bold text-center leading-tight',
                confidence === c.value ? c.color : 'text-text-tertiary'
              )}>
                {c.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Language */}
      <div>
        <FieldLabel>Language Used</FieldLabel>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {Object.entries(LANGUAGE_LABELS).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setValue('language', key, { shouldDirty: true })}
              className={cn(
                'px-3 py-2 rounded-xl border text-xs font-semibold transition-all',
                language === key
                  ? 'bg-brand-400/15 border-brand-400/40 text-brand-300'
                  : 'bg-surface-3 border-border-default text-text-secondary hover:border-brand-400/30 hover:text-text-primary'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <Textarea
        label="Difficulty Felt"
        optional
        hint="How hard did this problem feel? What made it challenging?"
        placeholder="e.g. The problem felt harder than Medium because the edge cases were tricky…"
        rows={2}
        {...register('difficultyFelt')}
      />

      <Textarea
        label="Where I Got Stuck"
        optional
        hint="Document your sticking points — they're your best learning opportunities."
        placeholder="e.g. I struggled with the off-by-one error in the window boundary…"
        rows={3}
        {...register('stuckPoints')}
      />

      {/* Hints used */}
      <div>
        <FieldLabel optional>Did you use hints or look at solutions?</FieldLabel>
        <div className="flex gap-3">
          {[
            { value: false, label: '✅ No hints', desc: 'Solved independently' },
            { value: true,  label: '💡 Used hints', desc: 'Referenced hints or solutions' },
          ].map(opt => (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => setValue('hintsUsed', opt.value, { shouldDirty: true })}
              className={cn(
                'flex-1 flex flex-col items-center gap-1 px-4 py-3 rounded-xl border',
                'transition-all duration-150 text-center',
                hintsUsed === opt.value
                  ? opt.value
                    ? 'bg-warning/10 border-warning/40 text-warning'
                    : 'bg-success/10 border-success/40 text-success'
                  : 'bg-surface-3 border-border-default text-text-secondary hover:border-border-strong'
              )}
            >
              <span className="text-sm font-bold">{opt.label}</span>
              <span className="text-[11px] opacity-70">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Review summary ─────────────────────────────────────
function ReviewSummary({ data, problem }) {
  const conf = CONFIDENCE_LEVELS.find(c => c.value === data.confidenceLevel)

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <div className="text-4xl mb-2">🎉</div>
        <h3 className="text-lg font-bold text-text-primary">Ready to submit!</h3>
        <p className="text-sm text-text-tertiary mt-1">
          Review your solution before saving.
        </p>
      </div>

      {[
        { label: 'Pattern',     value: data.patternIdentified },
        { label: 'Optimized Time',  value: data.optimizedTime },
        { label: 'Optimized Space', value: data.optimizedSpace },
        { label: 'Language',    value: LANGUAGE_LABELS[data.language] || data.language },
        { label: 'Key Insight', value: data.keyInsight },
      ].filter(r => r.value).map(row => (
        <div key={row.label}
             className="flex gap-3 bg-surface-2 border border-border-default rounded-xl p-3.5">
          <span className="text-xs font-bold text-text-disabled uppercase tracking-widest w-28 flex-shrink-0 pt-0.5">
            {row.label}
          </span>
          <span className="text-sm text-text-primary">{row.value}</span>
        </div>
      ))}

      {conf && (
        <div className="flex gap-3 bg-surface-2 border border-border-default rounded-xl p-3.5 items-center">
          <span className="text-xs font-bold text-text-disabled uppercase tracking-widest w-28 flex-shrink-0">
            Confidence
          </span>
          <span className="text-xl">{conf.emoji}</span>
          <span className={cn('text-sm font-bold', conf.color)}>{conf.label}</span>
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────
export default function SubmitSolutionPage() {
  const { id }     = useParams()
  const navigate   = useNavigate()
  const [step, setStep]               = useState(1)
  const [completedSteps, setCompleted] = useState(new Set())

  const { data: problem, isLoading } = useProblem(id)
  const createSolution = useCreateSolution()

  const form = useForm({
    defaultValues: {
      patternIdentified  : '',
      firstInstinct      : '',
      whyThisPattern     : '',
      timeToPatternSecs  : null,
      bruteForceApproach : '',
      bruteForceTime     : '',
      bruteForceSpace    : '',
      optimizedApproach  : '',
      optimizedTime      : '',
      optimizedSpace     : '',
      predictedTime      : '',
      predictedSpace     : '',
      keyInsight         : '',
      feynmanExplanation : '',
      realWorldConnection: '',
      followUpAnswers    : [],
      confidenceLevel    : 0,
      difficultyFelt     : '',
      stuckPoints        : '',
      hintsUsed          : false,
      language           : 'PYTHON',
    },
  })

  const { watch, handleSubmit } = form
  const formData = watch()

  function markComplete(stepId) {
    setCompleted(prev => new Set([...prev, stepId]))
  }

  function goNext() {
    markComplete(step)
    if (step < STEPS.length) {
      setStep(s => s + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  function goPrev() {
    if (step > 1) {
      setStep(s => s - 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  async function onSubmit(data) {
    const payload = {
      problemId          : id,
      patternIdentified  : data.patternIdentified  || null,
      firstInstinct      : data.firstInstinct      || null,
      whyThisPattern     : data.whyThisPattern     || null,
      timeToPatternSecs  : data.timeToPatternSecs  || null,
      bruteForceApproach : data.bruteForceApproach || null,
      bruteForceTime     : data.bruteForceTime     || null,
      bruteForceSpace    : data.bruteForceSpace    || null,
      optimizedApproach  : data.optimizedApproach  || null,
      optimizedTime      : data.optimizedTime      || null,
      optimizedSpace     : data.optimizedSpace     || null,
      predictedTime      : data.predictedTime      || null,
      predictedSpace     : data.predictedSpace     || null,
      keyInsight         : data.keyInsight         || null,
      feynmanExplanation : data.feynmanExplanation || null,
      realWorldConnection: data.realWorldConnection|| null,
      followUpAnswers    : data.followUpAnswers     || [],
      confidenceLevel    : data.confidenceLevel    || 0,
      difficultyFelt     : data.difficultyFelt     || null,
      stuckPoints        : data.stuckPoints        || null,
      hintsUsed          : data.hintsUsed          || false,
      language           : data.language           || 'PYTHON',
    }

    try {
      await createSolution.mutateAsync(payload)
      navigate(`/problems/${id}`)
    } catch {
      // error toast handled by the mutation
    }
  }

  if (isLoading) return <PageSpinner />

  if (!problem) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-text-secondary">Problem not found.</p>
        <Button variant="secondary" onClick={() => navigate('/problems')}>
          Back to Problems
        </Button>
      </div>
    )
  }

  const isLastStep = step === STEPS.length
  const currentStepMeta = STEPS[step - 1]

  return (
    <div className="p-6 max-w-[720px] mx-auto">
      {/* Back */}
      <button
        type="button"
        onClick={() => navigate(`/problems/${id}`)}
        className="flex items-center gap-1.5 text-sm text-text-tertiary
                   hover:text-text-primary transition-colors mb-6"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"/>
          <polyline points="12 19 5 12 12 5"/>
        </svg>
        Back to Problem
      </button>

      {/* Problem header */}
      <div className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-6">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge variant={DIFF_VARIANT[problem.difficulty] || 'brand'} size="xs">
                {problem.difficulty.charAt(0) + problem.difficulty.slice(1).toLowerCase()}
              </Badge>
              <span className="text-xs text-text-tertiary">
                {SOURCE_LABELS[problem.source] || problem.source}
              </span>
            </div>
            <h2 className="text-base font-bold text-text-primary">
              {problem.title}
            </h2>
            {problem.tags?.slice(0, 4).map(t => (
              <span key={t}
                    className="inline-block mr-1.5 mt-1.5 text-[11px] text-text-tertiary
                               bg-surface-3 border border-border-subtle rounded px-1.5 py-px">
                {t}
              </span>
            ))}
          </div>
          {problem.sourceUrl && (
            <a
              href={problem.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0"
            >
              <Button variant="outline" size="sm">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2"
                     strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                Open Problem
              </Button>
            </a>
          )}
        </div>
      </div>

      {/* Form card */}
      <div className="bg-surface-1 border border-border-default rounded-2xl p-6">
        {/* Step indicator */}
        <StepIndicator
          current={step}
          steps={STEPS}
          onStepClick={setStep}
          completedSteps={completedSteps}
        />

        {/* Step title */}
        <div className="mb-6">
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
            <span>{currentStepMeta.icon}</span>
            {currentStepMeta.label}
          </h2>
          <p className="text-sm text-text-tertiary mt-0.5">
            {currentStepMeta.desc}
          </p>
        </div>

        {/* Step content */}
        <form onSubmit={handleSubmit(onSubmit)}>
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0  }}
              exit   ={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }}
            >
              {step === 1 && <StepPattern    form={form} />}
              {step === 2 && <StepApproach   form={form} />}
              {step === 3 && <StepDepth      form={form} followUps={problem.followUps} />}
              {step === 4 && <StepAssessment form={form} />}
            </motion.div>
          </AnimatePresence>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6
                          border-t border-border-default">
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={goPrev}
              disabled={step === 1}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"/>
                <polyline points="12 19 5 12 12 5"/>
              </svg>
              Back
            </Button>

            <div className="flex items-center gap-2">
              {/* Step dots */}
              {STEPS.map(s => (
                <div key={s.id} className={cn(
                  'rounded-full transition-all duration-200',
                  s.id === step
                    ? 'w-6 h-2 bg-brand-400'
                    : completedSteps.has(s.id)
                      ? 'w-2 h-2 bg-success'
                      : 'w-2 h-2 bg-surface-4'
                )} />
              ))}
            </div>

            {isLastStep ? (
              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={createSolution.isPending}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2.5"
                     strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Save Solution
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={goNext}
              >
                Next
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2.5"
                     strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                  <polyline points="12 5 19 12 12 19"/>
                </svg>
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}