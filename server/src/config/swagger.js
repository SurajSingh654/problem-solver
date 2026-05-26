// ============================================================================
// ProbSolver v3.0 — Swagger / OpenAPI Configuration
// ============================================================================

import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "ProbSolver v3.0 API",
      version: "3.0.0",
      description:
        "Multi-tenant interview intelligence platform API.\n\n" +
        "**Authentication:** Most endpoints require a JWT token in the `Authorization: Bearer <token>` header.\n\n" +
        "**Team Context:** Team-scoped endpoints read the teamId from the JWT token automatically.\n\n" +
        "**Roles:**\n" +
        "- `SUPER_ADMIN` — Platform management\n" +
        "- `TEAM_ADMIN` — Team management + solving\n" +
        "- `MEMBER` — Solving only\n\n" +
        "---\n\n" +
        "## MCP — Model Context Protocol read-only server\n\n" +
        "A separate **JSON-RPC** endpoint lives at `/mcp` (NOT under `/api`). It " +
        "lets MCP-compatible clients (Claude Code, Cursor, ChatGPT, VS Code) read " +
        "your readiness data over the standardized MCP protocol.\n\n" +
        "**Swagger doesn't fit MCP** — MCP uses one endpoint with method-name " +
        "routing in the JSON body. Use these tools instead:\n\n" +
        "- **MCP Inspector** — `npx @modelcontextprotocol/inspector` then " +
        "point at `http://localhost:5000/mcp`. Auto-discovers tools/resources/" +
        "prompts and provides per-tool forms with schema validation.\n" +
        "- **Claude Code / Cursor / VS Code** — `claude mcp add binary-thinkers " +
        "http://localhost:5000/mcp --header \"Authorization: Bearer <mcp-token>\"`\n\n" +
        "See `docs/AGENT_TOOLING_REFERENCE.md` in the repo for the full MCP design + " +
        "threat model. Token issuance UI ships in Phase MCP-4.\n",
    },
    servers: [
      {
        url: "http://localhost:5000/api",
        description: "Local development",
      },
      // Production / deployed environment. The CLIENT_URL → server-URL
      // mapping in the original config was fragile (it stripped any port
      // off CLIENT_URL and appended PORT — wrong for Railway, where the
      // client + server are on different hosts). This entry hard-codes
      // the deployed Railway server URL when DEPLOYED_API_URL is set;
      // otherwise omits to avoid showing an incorrect "Current environment".
      ...(process.env.DEPLOYED_API_URL
        ? [{
            url: process.env.DEPLOYED_API_URL,
            description: "Deployed (Railway)",
          }]
        : []),
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Enter your JWT token from the /auth/login response",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            error: { type: "string", example: "Error message" },
            code: { type: "string", example: "ERROR_CODE" },
          },
        },
        Success: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
          },
        },
        User: {
          type: "object",
          properties: {
            id: { type: "string" },
            email: { type: "string" },
            name: { type: "string" },
            globalRole: { type: "string", enum: ["SUPER_ADMIN", "USER"] },
            currentTeamId: { type: "string", nullable: true },
            teamRole: {
              type: "string",
              enum: ["TEAM_ADMIN", "MEMBER"],
              nullable: true,
            },
            personalTeamId: { type: "string", nullable: true },
            isVerified: { type: "boolean" },
            onboardingComplete: { type: "boolean" },
            mustChangePassword: { type: "boolean" },
          },
        },
        Team: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            description: { type: "string", nullable: true },
            status: { type: "string", enum: ["PENDING", "ACTIVE", "REJECTED"] },
            joinCode: { type: "string", nullable: true },
            isPersonal: { type: "boolean" },
            maxMembers: { type: "integer" },
          },
        },
        Problem: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            difficulty: { type: "string", enum: ["EASY", "MEDIUM", "HARD"] },
            category: {
              type: "string",
              enum: [
                "CODING",
                "SYSTEM_DESIGN",
                "BEHAVIORAL",
                "CS_FUNDAMENTALS",
                "HR",
                "SQL",
              ],
            },
            source: { type: "string", enum: ["MANUAL", "AI_GENERATED"] },
            isPublished: { type: "boolean" },
            isPinned: { type: "boolean" },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      {
        name: "Auth",
        description: "Registration, login, verification, onboarding",
      },
      { name: "Teams", description: "Team creation, joining, management" },
      { name: "Problems", description: "Problem CRUD (team-scoped)" },
      {
        name: "Solutions",
        description: "Solution submission and review queue",
      },
      { name: "Stats", description: "Personal stats, leaderboard, 6D report" },
      { name: "Quizzes", description: "AI quiz generation and history" },
      { name: "Simulations", description: "Timer-based practice sessions" },
      { name: "Interviews", description: "AI mock interview sessions" },
      {
        name: "AI",
        description: "AI review, hints, coaching, content generation",
      },
      { name: "Recommendations", description: "Smart problem recommendations" },
      { name: "Platform", description: "SUPER_ADMIN platform management" },
      {
        name: "MCP (separate protocol)",
        description:
          "Model Context Protocol read-only server at /mcp — JSON-RPC, not REST. " +
          "Test with `npx @modelcontextprotocol/inspector`, not Swagger UI. " +
          "See description at top of page.",
      },
    ],
  },
  apis: [
    "./src/routes/*.js",
    "./src/mcp/server.js", // documents the /mcp endpoint surface
  ],
};

const swaggerSpec = swaggerJsdoc(options);

export function setupSwagger(app) {
  // Serve Swagger UI at /api-docs
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .info .title { font-size: 24px }
    `,
      customSiteTitle: "ProbSolver API Docs",
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: "none",
        filter: true,
        tagsSorter: "alpha",
      },
    }),
  );

  // Also serve raw spec as JSON
  app.get("/api-docs/spec.json", (req, res) => {
    res.json(swaggerSpec);
  });

  console.log(
    "📖 Swagger UI: http://localhost:" +
      (process.env.PORT || 5000) +
      "/api-docs",
  );
}
