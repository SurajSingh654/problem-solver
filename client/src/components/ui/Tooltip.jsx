import { useState, useRef }  from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn }                from '@utils/cn'

export function Tooltip({
  content,
  side      = 'top',
  children,
  className,
}) {
  const [visible, setVisible] = useState(false)
  const timer = useRef(null)

  const show = () => {
    timer.current = setTimeout(() => setVisible(true), 400)
  }

  const hide = () => {
    clearTimeout(timer.current)
    setVisible(false)
  }

  const positions = {
    top   : 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full  left-1/2 -translate-x-1/2 mt-2',
    left  : 'right-full top-1/2 -translate-y-1/2 mr-2',
    right : 'left-full  top-1/2 -translate-y-1/2 ml-2',
  }

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}

      <AnimatePresence>
        {visible && content && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit  ={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.1 }}
            className={cn(
              'absolute z-tooltip pointer-events-none',
              'bg-surface-4 border border-border-strong rounded-lg',
              'px-2.5 py-1.5 text-xs text-text-primary font-medium',
              'shadow-lg whitespace-nowrap',
              positions[side],
              className
            )}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}