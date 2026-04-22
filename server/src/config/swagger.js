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
        "- `MEMBER` — Solving only\n",
    },
    servers: [
      {
        url: "http://localhost:5000/api",
        description: "Local development",
      },
      {
        url: process.env.CLIENT_URL
          ? `${process.env.CLIENT_URL.replace(/:\d+$/, "")}:${process.env.PORT || 5000}/api`
          : "http://localhost:5000/api",
        description: "Current environment",
      },
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
    ],
  },
  apis: ["./src/routes/*.js"],
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
