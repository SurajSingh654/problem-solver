// ============================================================================
// ProbSolver v3.0 — Server Entry Point
// ============================================================================
//
// ARCHITECTURE:
//
// API Versioning: All routes live under /api/v1/. Unversioned /api/
// aliases point to v1 for backward compatibility. When v2 is needed,
// mount v2 routers alongside v1 — both coexist during migration.
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
import { requestIdMiddleware } from "./middleware/requestId.middleware.js";
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
import interviewRoutes from "./routes/interview.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import statsRoutes from "./routes/stats.routes.js";
import recommendationRoutes from "./routes/recommendations.routes.js";
import userRoutes from "./routes/users.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import platformRoutes from "./routes/platform.routes.js";

// ── WebSocket ────────────────────────────────────────────────
import { setupWebSocket } from "./services/websocket.service.js";

// ── Feedback routes ───────────────────────────────────────────────
import feedbackRoutes from './routes/feedback.routes.js'

// ============================================================================
// APP SETUP
// ============================================================================
const app = express();
const server = createServer(app);

// Railway runs behind a reverse proxy — required for rate limiter
app.set("trust proxy", 1);

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

// ── 3. Body parsing ──────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── 4. Request ID (before logger so IDs appear in logs) ──
app.use(requestIdMiddleware);

// ── 5. Request logging ───────────────────────────────────
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
    apiVersions: ["v1"],
  });
});

// ============================================================================
// API v1 ROUTES
// ============================================================================
// All routes are mounted under /api/v1/ as the canonical path.
// Unversioned /api/ aliases are provided for backward compatibility
// and will be deprecated in a future release.
//
// Route categories:
// ── Auth: registration, login, verification, password management
// ── Platform: SuperAdmin-only platform-wide endpoints
// ── Teams: team creation, joining, management
// ── Content: problems, solutions (team-scoped)
// ── Practice: quizzes, simulations, mock interviews (team-scoped)
// ── Intelligence: stats, recommendations, AI features (team-scoped)
// ── Admin: team-admin analytics (team-scoped)
// ── Users: user profiles, management
// ============================================================================

function mountRoutes(prefix) {
  // ── Auth (stricter rate limit on login/register/forgot) ──
  app.use(`${prefix}/auth/login`, authLimiter);
  app.use(`${prefix}/auth/register`, authLimiter);
  app.use(`${prefix}/auth/forgot-password`, authLimiter);
  app.use(`${prefix}/auth`, authRoutes);

  // ── Platform (SuperAdmin only — no team context) ─────────
  app.use(`${prefix}/platform`, aiLimiter, platformRoutes);

  // ── Teams ────────────────────────────────────────────────
  app.use(`${prefix}/teams`, apiLimiter, teamRoutes);

  // ── Content (team-scoped) ────────────────────────────────
  app.use(`${prefix}/problems`, apiLimiter, problemRoutes);
  app.use(`${prefix}/solutions`, apiLimiter, solutionRoutes);

  // ── Practice (team-scoped) ───────────────────────────────
  app.use(`${prefix}/quizzes`, apiLimiter, quizRoutes);
  app.use(`${prefix}/interview-v2`, apiLimiter, interviewRoutes);

  // ── Intelligence (team-scoped) ───────────────────────────
  app.use(`${prefix}/stats`, apiLimiter, statsRoutes);
  app.use(`${prefix}/recommendations`, apiLimiter, recommendationRoutes);
  app.use(`${prefix}/ai`, aiLimiter, aiRoutes);

  // ── Admin (team-admin analytics) ─────────────────────────
  app.use(`${prefix}/admin`, aiLimiter, adminRoutes);

  // ── Users ────────────────────────────────────────────────
  app.use(`${prefix}/users`, apiLimiter, userRoutes);




// alongside the other route registrations:
app.use(`${prefix}/feedback`, feedbackRoutes)
}

// Canonical versioned routes
mountRoutes("/api/v1");

// Backward-compatible unversioned aliases (same routers, no duplication)
mountRoutes("/api");

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
      console.log(`\n   API v1 Routes:`);
      console.log(
        `   ├── /api/v1/auth         (register, login, verify, onboarding)`,
      );
      console.log(`   ├── /api/v1/platform     (SuperAdmin: health, analysis)`);
      console.log(
        `   ├── /api/v1/teams        (create, join, leave, invite, manage)`,
      );
      console.log(`   ├── /api/v1/problems     (CRUD, team-scoped)`);
      console.log(`   ├── /api/v1/solutions    (submit, review queue)`);
      console.log(`   ├── /api/v1/quizzes      (AI generation, history)`);
      console.log(`   ├── /api/v1/interview-v2 (AI mock interviews)`);
      console.log(`   ├── /api/v1/ai           (review, hints, coaching)`);
      console.log(`   ├── /api/v1/stats        (personal, leaderboard, 6D)`);
      console.log(`   ├── /api/v1/recommendations`);
      console.log(`   ├── /api/v1/users        (profiles, management)`);
      console.log(`   ├── /api/v1/admin        (team analytics)`);
      console.log(`   ├── /api-docs            (Swagger UI)`);
      console.log(`   └── /health`);
      console.log(`\n   Backward-compatible aliases at /api/* → /api/v1/*\n`);
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
