// ============================================================================
// ProbSolver v3.0 — Server Entry Point
// ============================================================================
//
// MIDDLEWARE ORDER:
// 1. Security headers (Helmet)
// 2. CORS
// 3. Body parsing
// 4. Request logging (morgan)
// 5. Swagger docs
// 6. Health check
// 7. Rate limiters + Routes
// 8. WebSocket
// 9. 404 handler
// 10. Global error handler
//
// ============================================================================

import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createServer } from "http";

import { PORT, CLIENT_URL, IS_PRODUCTION, NODE_ENV } from "./config/env.js";
import prisma from "./lib/prisma.js";
import { errorHandler } from "./middleware/error.middleware.js";
import {
  apiLimiter,
  authLimiter,
  aiLimiter,
} from "./middleware/rateLimit.middleware.js";
import { devLogger, prodLogger } from "./middleware/logger.middleware.js";
import { setupQueryLogging } from "./middleware/queryLogger.middleware.js";
import { setupSwagger } from "./config/swagger.js";

// ── Route imports ────────────────────────────────────────────
import authRoutes from "./routes/auth.routes.js";
import teamRoutes from "./routes/team.routes.js";
import problemRoutes from "./routes/problems.routes.js";
import solutionRoutes from "./routes/solutions.routes.js";
import quizRoutes from "./routes/quiz.routes.js";
import simRoutes from "./routes/sim.routes.js";
import interviewRoutes from "./routes/interview.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import statsRoutes from "./routes/stats.routes.js";
import recommendationRoutes from "./routes/recommendations.routes.js";
import userRoutes from './routes/users.routes.js'
import adminRoutes from './routes/admin.routes.js'

// ── WebSocket ────────────────────────────────────────────────
import { setupWebSocket } from "./services/websocket.service.js";

// ============================================================================
// APP SETUP
// ============================================================================

const app = express();
const server = createServer(app);

// v3.0 FIX: Railway runs behind a reverse proxy — required for rate limiter
app.set('trust proxy', 1)

// ── 1. Security headers ──────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: IS_PRODUCTION ? undefined : false,
  }),
);

// ── 2. CORS ──────────────────────────────────────────────────
app.use(
  cors({
    origin: IS_PRODUCTION
      ? CLIENT_URL
      : ["http://localhost:3000", "http://localhost:5173", CLIENT_URL],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Team-Id"],
  }),
);

// ── 3. Body parsing ──────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── 4. Request logging ───────────────────────────────────────
app.use(IS_PRODUCTION ? prodLogger : devLogger);

// ── 5. Swagger API docs ─────────────────────────────────────
setupSwagger(app);

// ── 6. Query performance logging ─────────────────────────────
setupQueryLogging(prisma);

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    environment: NODE_ENV,
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    version: "3.0.0",
  });
});

// ============================================================================
// API ROUTES (with rate limiting)
// ============================================================================

// ── Auth (stricter rate limit on login/register/forgot) ──────
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/auth", authRoutes);

// ── Teams ────────────────────────────────────────────────────
app.use("/api/teams", apiLimiter, teamRoutes);

// ── Core features (standard rate limit) ──────────────────────
app.use("/api/problems", apiLimiter, problemRoutes);
app.use("/api/solutions", apiLimiter, solutionRoutes);
app.use("/api/quizzes", apiLimiter, quizRoutes);
app.use("/api/sim", apiLimiter, simRoutes);
app.use("/api/interview-v2", apiLimiter, interviewRoutes);
app.use("/api/stats", apiLimiter, statsRoutes);
app.use("/api/recommendations", apiLimiter, recommendationRoutes);

// ── AI (stricter rate limit — expensive operations) ──────────
app.use("/api/ai", aiLimiter, aiRoutes);

// ── Future routes ────────────────────────────────────────────
// TODO: Rewrite users.controller.js for v3.0 schema
app.use('/api/users', apiLimiter, userRoutes)
// TODO: Rewrite analytics.controller.js for v3.0 schema
app.use('/api/admin', aiLimiter, adminRoutes)

// ============================================================================
// WEBSOCKET
// ============================================================================

setupWebSocket(server);

// ============================================================================
// ERROR HANDLING
// ============================================================================

// ── 404 handler ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.originalUrl} not found.`,
  });
});

// ── Global error handler ─────────────────────────────────────
app.use(errorHandler);

// ============================================================================
// START SERVER
// ============================================================================

async function start() {
  try {
    console.log("\n⚡ ProbSolver v3.0\n");
    console.log("📡 Connecting to database...");
    await prisma.$connect();
    console.log("✅ Database connected\n");

    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`   Environment: ${NODE_ENV}`);
      console.log(`   Client URL:  ${CLIENT_URL}`);
      console.log(`   Health:      http://localhost:${PORT}/health`);
      console.log(`\n   Routes:`);
      console.log(
        `   ├── /api/auth         (register, login, verify, onboarding)`,
      );
      console.log(
        `   ├── /api/teams        (create, join, leave, invite, manage)`,
      );
      console.log(`   ├── /api/problems     (CRUD, team-scoped)`);
      console.log(`   ├── /api/solutions    (submit, review queue)`);
      console.log(`   ├── /api/quizzes      (AI generation, history)`);
      console.log(`   ├── /api/sim          (timer sessions)`);
      console.log(`   ├── /api/interview-v2 (AI mock interviews)`);
      console.log(`   ├── /api/ai           (review, hints, coaching)`);
      console.log(`   ├── /api/stats        (personal, leaderboard, 6D)`);
      console.log(`   ├── /api/recommendations`);
      console.log(`   ├── /api-docs         (Swagger UI)`);
      console.log(`   └── /health\n`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
}

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

async function shutdown(signal) {
  console.log(`\n🛑 ${signal} received. Shutting down gracefully...`);

  server.close(async () => {
    console.log("   HTTP server closed.");
    await prisma.$disconnect();
    console.log("   Database disconnected.");
    console.log("   Goodbye.\n");
    process.exit(0);
  });

  setTimeout(() => {
    console.error("   Forced exit after timeout.");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

start();
