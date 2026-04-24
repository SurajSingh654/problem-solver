import { useState, useEffect } from 'react'
import { Spinner } from '@components/ui/Spinner'
import api from '@services/api'

import Section1Hero from './Section1Hero'
import Section2Features from './Section2Features'
import Section3AI from './Section3AI'
import Section4Compare from './Section4Compare'
import Section5Teams from './Section5Teams'
import Section6Technical from './Section6Technical'
import Section7Stats from './Section7Stats'
import Section8CTA from './Section8CTA'

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
            <Section1Hero stats={stats} />
            <Section2Features />
            <Section3AI stats={stats} />
            <Section4Compare />
            <Section5Teams />
            <Section6Technical stats={stats} />
            <Section7Stats stats={stats} />
            <Section8CTA />
        </div>
    )
}