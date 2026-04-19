import "express-async-errors";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { chdir } from "process";
import { existsSync } from "fs";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error.middleware.js";

// Route imports
import authRoutes from "./routes/auth.routes.js";
import problemRoutes from "./routes/problems.routes.js";
import solutionRoutes from "./routes/solutions.routes.js";
import userRoutes from "./routes/users.routes.js";
import statsRoutes from "./routes/stats.routes.js";
import simRoutes from "./routes/sim.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import prisma from "./lib/prisma.js";
import quizRoutes from "./routes/quiz.routes.js";
import recommendationRoutes from "./routes/recommendations.routes.js";
import adminRoutes from './routes/admin.routes.js'

const app = express();

// ── Resolve __dirname (needed for ES modules) ─────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
chdir(resolve(__dirname, "../"));

// ── Auto-seed if database is empty ────────────────────
async function autoSeedIfEmpty() {
  try {
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      console.log("  📦 Database empty — running seed...");
      const { execSync } = await import("child_process");
      execSync("node prisma/seed.js", {
        cwd: process.cwd(),
        stdio: "inherit",
        env: process.env,
      });
    }
  } catch (e) {
    console.log("  ⚠️  Auto-seed skipped:", e.message);
  }
}

// ── Security ──────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
  }),
);

// ── CORS ──────────────────────────────────────────────
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// ── Body parsing ──────────────────────────────────────
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Logging ───────────────────────────────────────────
if (env.IS_DEV) {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

// ── Serve docs ────────────────────────────────────────
// Path: server/src/index.js → up 3 levels → project root → docs/
const docsPath = join(__dirname, "../../../docs");
if (existsSync(docsPath)) {
  app.use("/docs", express.static(docsPath));
}

// ── Health check ──────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    aiEnabled: env.AI_ENABLED,
    docs: {
      readme: "http://localhost:" + env.PORT + "/docs/README.html",
      setup: "http://localhost:" + env.PORT + "/docs/SETUP.html",
    },
  });
});

// ── API Routes ────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/problems", problemRoutes);
app.use("/api/solutions", solutionRoutes);
app.use("/api/users", userRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/sim", simRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/quizzes", quizRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use('/api/admin', adminRoutes)

// ── 404 handler ───────────────────────────────────────
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.originalUrl} not found`,
    code: "NOT_FOUND",
  });
});

// ── Global error handler (must be last) ───────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────
app.listen(env.PORT, async () => {
  console.log("");
  console.log("  ⚡ ProbSolver API");
  console.log(`  🚀 Running on   http://localhost:${env.PORT}`);
  console.log(`  🌍 Environment: ${env.NODE_ENV}`);
  console.log(`  🤖 AI features: ${env.AI_ENABLED ? "enabled" : "disabled"}`);
  console.log("");

  // Auto-seed on first deploy
  await autoSeedIfEmpty();
});

export default app;
