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

const app = express();

// ── Resolve __dirname (needed for ES modules) ─────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
chdir(resolve(__dirname, "../"));

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
app.listen(env.PORT, () => {
  console.log("");
  console.log("  ⚡ ProbSolver API");
  console.log(`  🚀 Running on   http://localhost:${env.PORT}`);
  console.log(`  🌍 Environment: ${env.NODE_ENV}`);
  console.log(`  🤖 AI features: ${env.AI_ENABLED ? "enabled" : "disabled"}`);
  console.log(
    `  📄 README:      http://localhost:${env.PORT}/docs/README.html`,
  );
  console.log(`  📄 Setup:       http://localhost:${env.PORT}/docs/SETUP.html`);
  console.log(`  ❤️  Health:      http://localhost:${env.PORT}/health`);
  console.log("");
});

export default app;
