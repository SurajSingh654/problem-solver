import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@utils/cn'
import { DIMENSIONS } from '@utils/constants'

// Pure SVG radar — no recharts dependency needed for this shape
export function RadarChart({ dimensions = {}, size = 280 }) {
    const cx = size / 2
    const cy = size / 2
    const radius = size * 0.38
    const count = DIMENSIONS.length

    // Polygon points for a given scale factor (0–1)
    function getPoints(scale) {
        return DIMENSIONS.map((_, i) => {
            const angle = (Math.PI * 2 * i) / count - Math.PI / 2
            const r = radius * scale
            return {
                x: cx + r * Math.cos(angle),
                y: cy + r * Math.sin(angle),
            }
        })
    }

    function toPath(pts) {
        return pts.map((p, i) =>
            `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`
        ).join(' ') + ' Z'
    }

    // Data points (0–100 → 0–1)
    const dataPoints = DIMENSIONS.map(d => {
        const val = dimensions[d.id] ?? 0
        return Math.min(Math.max(val / 100, 0), 1)
    })

    const dataPath = useMemo(() => {
        const pts = DIMENSIONS.map((d, i) => {
            const angle = (Math.PI * 2 * i) / count - Math.PI / 2
            const r = radius * dataPoints[i]
            return {
                x: cx + r * Math.cos(angle),
                y: cy + r * Math.sin(angle),
            }
        })
        return toPath(pts)
    }, [dimensions])

    // Axis label positions (slightly outside the ring)
    const labelRadius = radius + 22
    const labelPoints = DIMENSIONS.map((d, i) => {
        const angle = (Math.PI * 2 * i) / count - Math.PI / 2
        return {
            x: cx + labelRadius * Math.cos(angle),
            y: cy + labelRadius * Math.sin(angle),
            label: d.short,
            color: d.color,
            score: dimensions[d.id] ?? 0,
        }
    })

    const rings = [0.25, 0.5, 0.75, 1.0]

    return (
        <div className="flex flex-col items-center gap-4">
            <svg
                width={size}
                height={size}
                viewBox={`0 0 ${size} ${size}`}
                className="overflow-visible"
            >
                {/* Background rings */}
                {rings.map(scale => (
                    <path
                        key={scale}
                        d={toPath(getPoints(scale))}
                        fill="none"
                        stroke="rgba(255,255,255,0.06)"
                        strokeWidth="1"
                    />
                ))}

                {/* Axis lines */}
                {DIMENSIONS.map((_, i) => {
                    const angle = (Math.PI * 2 * i) / count - Math.PI / 2
                    const outerX = cx + radius * Math.cos(angle)
                    const outerY = cy + radius * Math.sin(angle)
                    return (
                        <line
                            key={i}
                            x1={cx} y1={cy}
                            x2={outerX} y2={outerY}
                            stroke="rgba(255,255,255,0.06)"
                            strokeWidth="1"
                        />
                    )
                })}

                {/* Data fill */}
                <motion.path
                    d={dataPath}
                    fill="rgba(124,111,247,0.15)"
                    stroke="#7c6ff7"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                    style={{ transformOrigin: `${cx}px ${cy}px` }}
                />

                {/* Data point dots */}
                {DIMENSIONS.map((d, i) => {
                    const angle = (Math.PI * 2 * i) / count - Math.PI / 2
                    const r = radius * dataPoints[i]
                    const x = cx + r * Math.cos(angle)
                    const y = cy + r * Math.sin(angle)
                    return (
                        <motion.circle
                            key={d.id}
                            cx={x} cy={y} r={4}
                            fill={d.color}
                            stroke="rgba(0,0,0,0.4)"
                            strokeWidth="1.5"
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.4, delay: 0.5 + i * 0.06 }}
                            style={{ transformOrigin: `${x}px ${y}px` }}
                        />
                    )
                })}

                {/* Axis labels */}
                {labelPoints.map((lp, i) => {
                    const textAnchor =
                        lp.x < cx - 5 ? 'end' :
                            lp.x > cx + 5 ? 'start' : 'middle'
                    return (
                        <g key={i}>
                            <text
                                x={lp.x}
                                y={lp.y - 4}
                                textAnchor={textAnchor}
                                dominantBaseline="auto"
                                fontSize="10"
                                fontWeight="700"
                                fontFamily="Inter, sans-serif"
                                fill={lp.color}
                                className="uppercase tracking-wider"
                            >
                                {lp.label}
                            </text>
                            <text
                                x={lp.x}
                                y={lp.y + 8}
                                textAnchor={textAnchor}
                                dominantBaseline="auto"
                                fontSize="11"
                                fontWeight="800"
                                fontFamily="JetBrains Mono, monospace"
                                fill="rgba(238,238,245,0.7)"
                            >
                                {lp.score}
                            </text>
                        </g>
                    )
                })}

                {/* Center score */}
                <text
                    x={cx} y={cy - 6}
                    textAnchor="middle"
                    dominantBaseline="auto"
                    fontSize="22"
                    fontWeight="800"
                    fontFamily="JetBrains Mono, monospace"
                    fill="#eeeef5"
                >
                    {Math.round(
                        Object.values(dimensions).reduce((a, b) => a + b, 0) /
                        Math.max(Object.values(dimensions).length, 1)
                    )}
                </text>
                <text
                    x={cx} y={cy + 10}
                    textAnchor="middle"
                    dominantBaseline="auto"
                    fontSize="9"
                    fontWeight="600"
                    fontFamily="Inter, sans-serif"
                    fill="rgba(238,238,245,0.35)"
                    className="uppercase tracking-widest"
                >
                    Overall
                </text>
            </svg>
        </div>
    )
}