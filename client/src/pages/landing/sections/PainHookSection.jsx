import { motion, useReducedMotion } from 'framer-motion'

export default function PainHookSection() {
    const reduce = useReducedMotion()

    const sectionMotion = reduce
        ? {}
        : {
            initial: { opacity: 0, y: 24 },
            whileInView: { opacity: 1, y: 0 },
            viewport: { once: true, margin: '-100px' },
            transition: { duration: 0.6, ease: 'easeOut' },
        }

    return (
        <motion.section className="py-20 lg:py-28 border-t border-border-subtle" {...sectionMotion}>
            <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-text-primary mb-6 leading-tight">
                    Grinding LeetCode tells you{' '}
                    <span className="text-text-disabled line-through decoration-2">how many problems you've solved</span>.
                    {' '}
                    It doesn't tell you if you're <span className="text-brand-fg">ready</span>.
                </h2>

                <div className="mt-12 grid gap-4 text-left">
                    <PainBullet
                        stat="87%"
                        statColor="text-warning-fg"
                        text='of candidates rate themselves "ready" before a FAANG loop. About'
                        statSuffix="4%"
                        suffixColor="text-danger-fg"
                        textSuffix="actually pass."
                    />
                    <PainBullet
                        stat="K-D 1999"
                        statColor="text-info-fg"
                        text="Self-assessment without external calibration is the Kruger-Dunning trap — the less you know, the more confident you are."
                    />
                    <PainBullet
                        stat="1500"
                        statColor="text-text-disabled"
                        text='LeetCode rating tells you nothing about how you handle "explain your trade-off" probing — the part that decides hire/no-hire.'
                    />
                </div>
            </div>
        </motion.section>
    )
}

function PainBullet({ stat, statColor, text, statSuffix, suffixColor, textSuffix }) {
    return (
        <div className="flex items-start gap-4 p-5 rounded-xl bg-surface-1 border border-border-subtle">
            <span className={`flex-shrink-0 font-mono font-extrabold text-xl ${statColor} mt-0.5 min-w-[64px]`}>
                {stat}
            </span>
            <p className="text-base sm:text-lg text-text-secondary leading-relaxed">
                {text}
                {statSuffix && (
                    <>
                        {' '}
                        <span className={`font-mono font-extrabold ${suffixColor}`}>{statSuffix}</span>{' '}
                        {textSuffix}
                    </>
                )}
            </p>
        </div>
    )
}
