// ============================================================================
// ProbSolver v3.0 — Server Entry Point
// ============================================================================
//
// DESIGN DECISIONS:
//
// 1. Middleware order matters critically:
//    a. Security headers (Helmet) — first, always
//    b. CORS — before any route handling
//    c. Body parsing — before routes read req.body
//    d. Request logging — before routes (to log all requests)
//    e. Routes — the actual business logic
//    f. Error handler — last (catches everything upstream)
//
// 2. WebSocket server: Attached to the same HTTP server on the same
//    port. No separate WebSocket port needed. The upgrade event is
//    handled by the ws library transparently.
//
// 3. Graceful shutdown: On SIGTERM/SIGINT (Railway sends SIGTERM on
//    deploy), we close the HTTP server, disconnect Prisma, and exit.
//    This prevents connection leaks and ensures in-flight requests
//    complete before shutdown.
//
// 4. Route registration: Each route group is a separate file imported
//    and mounted at its prefix. New route groups (like /api/teams)
//    are added here as single lines.
//
// 5. Health check: GET /health returns 200 with uptime and timestamp.
//    Railway uses this to verify the service is alive.
//
// ============================================================================

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { createServer } from 'http'

import { PORT, CLIENT_URL, IS_PRODUCTION, NODE_ENV } from './config/env.js'
import prisma from './lib/prisma.js'
import { errorHandler } from './middleware/error.middleware.js'

// ── Route imports ────────────────────────────────────────────
import authRoutes from './routes/auth.routes.js'
import teamRoutes from './routes/team.routes.js'
// Phase 2 routes — uncomment as they're built:
import problemRoutes from './routes/problems.routes.js'
import solutionRoutes from './routes/solutions.routes.js'
import quizRoutes from './routes/quiz.routes.js'
import simRoutes from './routes/sim.routes.js'
import interviewRoutes from './routes/interview.routes.js'
import aiRoutes from './routes/ai.routes.js'
import statsRoutes from './routes/stats.routes.js'
import recommendationRoutes from './routes/recommendations.routes.js'
// import userRoutes from './routes/users.routes.js'
// import adminRoutes from './routes/admin.routes.js'

// ── WebSocket import (Phase 2) ───────────────────────────────
import { setupWebSocket } from './services/websocket.service.js'

// ============================================================================
// APP SETUP
// ============================================================================

const app = express()
const server = createServer(app)

// ── 1. Security headers ──────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: IS_PRODUCTION ? undefined : false,
}))

// ── 2. CORS ──────────────────────────────────────────────────
app.use(cors({
  origin: IS_PRODUCTION
    ? CLIENT_URL
    : ['http://localhost:3000', 'http://localhost:5173', CLIENT_URL],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Team-Id'],
}))

// ── 3. Body parsing ──────────────────────────────────────────
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// ── 4. Request logging (development only) ────────────────────
if (!IS_PRODUCTION) {
  app.use((req, res, next) => {
    const start = Date.now()
    res.on('finish', () => {
      const duration = Date.now() - start
      const status = res.statusCode
      const color = status >= 400 ? '\x1b[31m' : status >= 300 ? '\x1b[33m' : '\x1b[32m'
      console.log(`${color}${req.method}\x1b[0m ${req.originalUrl} → ${status} (${duration}ms)`)
    })
    next()
  })
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    environment: NODE_ENV,
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    version: '3.0.0',
  })
})

// ============================================================================
// API ROUTES
// ============================================================================

// ── Phase 1: Auth + Teams ────────────────────────────────────
app.use('/api/auth', authRoutes)
app.use('/api/teams', teamRoutes)

// ── Phase 2: Core features (scoped) ─────────────────────────
app.use('/api/problems', problemRoutes)
app.use('/api/solutions', solutionRoutes)
app.use('/api/quizzes', quizRoutes)
app.use('/api/sim', simRoutes)
app.use('/api/interview-v2', interviewRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/stats', statsRoutes)
app.use('/api/recommendations', recommendationRoutes)
// app.use('/api/users', userRoutes)
// app.use('/api/admin', adminRoutes)

// ============================================================================
// WEBSOCKET (Phase 2)
// ============================================================================

setupWebSocket(server)

// ============================================================================
// ERROR HANDLING
// ============================================================================

// ── 404 handler ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.originalUrl} not found.`,
  })
})

// ── Global error handler ─────────────────────────────────────
app.use(errorHandler)

// ============================================================================
// START SERVER
// ============================================================================

async function start() {
  try {
    // ── Verify database connection ─────────────────────
    console.log('\n⚡ ProbSolver v3.0\n')
    console.log('📡 Connecting to database...')
    await prisma.$connect()
    console.log('✅ Database connected\n')

    // ── Start HTTP server ──────────────────────────────
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`)
      console.log(`   Environment: ${NODE_ENV}`)
      console.log(`   Client URL:  ${CLIENT_URL}`)
      console.log(`   Health:      http://localhost:${PORT}/health`)
      console.log(`\n   Routes:`)
      console.log(`   ├── /api/auth    (register, login, verify, onboarding)`)
      console.log(`   ├── /api/teams   (create, join, leave, invite, manage)`)
      console.log(`   └── /health      (health check)\n`)
    })
  } catch (err) {
    console.error('❌ Failed to start server:', err)
    process.exit(1)
  }
}

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

async function shutdown(signal) {
  console.log(`\n🛑 ${signal} received. Shutting down gracefully...`)

  server.close(async () => {
    console.log('   HTTP server closed.')
    await prisma.$disconnect()
    console.log('   Database disconnected.')
    console.log('   Goodbye.\n')
    process.exit(0)
  })

  // Force exit if graceful shutdown takes too long
  setTimeout(() => {
    console.error('   Forced exit after timeout.')
    process.exit(1)
  }, 10000)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// ── Start ────────────────────────────────────────────────────
start()