import { useState, useEffect } from 'react'
import { Spinner } from '@components/ui/Spinner'
import api from '@services/api'

import Section1Problem from './Section1Problem'
import Section2Vision from './Section2Vision'
import Section3Features from './Section3Features'
import Section4Architecture from './Section4Architecture'
import Section5AIPipeline from './Section5AIPipeline'
import Section6Metrics from './Section6Metrics'
import Section7Roadmap from './Section7Roadmap'
import Section8Competitive from './Section8Competitive'
import Section9Specs from './Section9Specs'
import Section10CTA from './Section10CTA'

export default function ShowcasePage() {
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function fetchStats() {
            try {
                const res = await api.get('/stats/showcase')
                setStats(res.data.data)
            } catch (err) {
                console.error('Failed to load showcase stats:', err)
            } finally {
                setLoading(false)
            }
        }
        fetchStats()
    }, [])

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="flex flex-col items-center gap-3">
                    <Spinner size="lg" />
                    <p className="text-xs text-text-tertiary">Loading showcase...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen">
            <Section1Problem />
            <Section2Vision stats={stats} />
            <Section3Features stats={stats} />
            <Section4Architecture />
            <Section5AIPipeline stats={stats} />
            <Section6Metrics stats={stats} />
            <Section7Roadmap />
            <Section8Competitive />
            <Section9Specs stats={stats} />
            <Section10CTA />
        </div>
    )
}