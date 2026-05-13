// ── Interviewer persona menu ────────────────────────────────────────────
// Mirrors MockInterviewPage's INTERVIEW_STYLES — single source of truth for
// the design-studio interview entry. Kept in sync manually with the mock
// interview list. SYSTEM_FOCUSED leads since this is a design-studio
// surface and that's the SD-friendly default.
export const INTERVIEW_STYLES = [
    { id: 'SYSTEM_FOCUSED', label: 'System-Focused', icon: '🏗️', desc: 'Architecture, scale, reliability', examples: 'AWS, Cloudflare, Databricks' },
    { id: 'ALGORITHM_FOCUSED', label: 'Algorithm-Focused', icon: '🎯', desc: 'Structured, rubric-based — most tech companies', examples: 'Google, Meta, Apple, Stripe' },
    { id: 'PRAGMATIC_STARTUP', label: 'Startup / Pragmatic', icon: '🚀', desc: 'Ship fast, breadth over depth', examples: 'Startups, small teams, agencies' },
    { id: 'COLLABORATIVE', label: 'Collaborative', icon: '🤝', desc: 'Pair programming feel, testing mindset', examples: 'Microsoft, Thoughtworks' },
    { id: 'PRODUCT_ORIENTED', label: 'Product-Oriented', icon: '📱', desc: '"Why" matters more than "how"', examples: 'Spotify, Pinterest, Notion' },
    { id: 'HIGH_PRESSURE', label: 'High-Pressure', icon: '⚡', desc: 'Fast-paced, no hints, mathematical rigor', examples: 'Trading firms, competitive roles' },
    { id: 'DOMAIN_SPECIFIC', label: 'Domain-Specific', icon: '🏢', desc: 'Industry knowledge + tech skills', examples: 'Banks, healthcare, fintech' },
    { id: 'VALUES_DRIVEN', label: 'Values-Driven', icon: '🗣️', desc: 'Behavioral-heavy, culture fit', examples: 'Amazon, mission-driven orgs' },
]
