/**
 * WEBSOCKET SERVICE — Real-time communication for AI Mock Interviews
 * Runs alongside Express on the same HTTP server.
 * Handles: JWT auth, message routing, connection management.
 */
import { WebSocketServer } from "ws";
import { verifyToken } from "../lib/jwt.js";
import prisma from "../lib/prisma.js";

// Store active connections: sessionId → { ws, userId, user }
const activeConnections = new Map();

// Store interview handlers: sessionId → InterviewHandler
const activeInterviews = new Map();

/**
 * Initialize WebSocket server on the existing HTTP server
 */
export function initWebSocket(httpServer) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws/interview",
  });

  console.log("  🔌 WebSocket server initialized at /ws/interview");

  wss.on("connection", async (ws, req) => {
    try {
      // ── Extract JWT from query string ──────────────
      const url = new URL(req.url, `http://${req.headers.host}`);
      const token = url.searchParams.get("token");
      const sessionId = url.searchParams.get("sessionId");

      if (!token) {
        ws.close(4001, "No authentication token provided");
        return;
      }

      if (!sessionId) {
        ws.close(4002, "No session ID provided");
        return;
      }

      // ── Verify JWT ─────────────────────────────────
      let decoded;
      try {
        decoded = verifyToken(token);
      } catch (err) {
        ws.close(4003, "Invalid or expired token");
        return;
      }

      // ── Look up user ───────────────────────────────
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          username: true,
          role: true,
          currentLevel: true,
          targetCompanies: true,
          avatarColor: true,
        },
      });

      if (!user) {
        ws.close(4004, "User not found");
        return;
      }

      // ── Verify session belongs to user ─────────────
      const session = await prisma.interviewSession.findUnique({
        where: { id: sessionId },
        include: {
          problem: {
            select: {
              id: true,
              title: true,
              difficulty: true,
              category: true,
              description: true,
              tags: true,
              companyTags: true,
              realWorldContext: true,
              adminNotes: true,
              followUps: {
                orderBy: { order: "asc" },
                select: { question: true, difficulty: true, hint: true },
              },
            },
          },
        },
      });

      if (!session) {
        ws.close(4005, "Interview session not found");
        return;
      }

      if (session.userId !== user.id) {
        ws.close(4006, "Session does not belong to this user");
        return;
      }

      if (session.status !== "ACTIVE") {
        ws.close(4007, "Session is not active");
        return;
      }

      // ── Connection established ─────────────────────
      console.log(`[WS] Connected: ${user.username} → session ${sessionId}`);

      // Store connection
      activeConnections.set(sessionId, { ws, userId: user.id, user });

      // Send connection success
      sendMessage(ws, {
        type: "connected",
        data: {
          sessionId,
          userId: user.id,
          username: user.username,
          status: session.status,
        },
      });

      // ── Handle incoming messages ───────────────────
      ws.on("message", async (rawData) => {
        try {
          const message = JSON.parse(rawData.toString());
          await handleMessage(sessionId, user, session, message, ws);
        } catch (err) {
          console.error(`[WS] Message handling error:`, err.message);
          sendMessage(ws, {
            type: "error",
            data: { message: "Failed to process message: " + err.message },
          });
        }
      });

      // ── Handle disconnection ───────────────────────
      ws.on("close", (code, reason) => {
        console.log(`[WS] Disconnected: ${user.username} (code: ${code})`);
        activeConnections.delete(sessionId);
      });

      // ── Handle errors ──────────────────────────────
      ws.on("error", (err) => {
        console.error(`[WS] Error for ${user.username}:`, err.message);
        activeConnections.delete(sessionId);
      });

      // ── Heartbeat to keep connection alive ─────────
      ws.isAlive = true;
      ws.on("pong", () => {
        ws.isAlive = true;
      });
    } catch (err) {
      console.error("[WS] Connection error:", err.message);
      ws.close(4999, "Internal server error");
    }
  });

  // ── Heartbeat interval — detect dead connections ───
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        console.log("[WS] Terminating dead connection");
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000); // every 30 seconds

  wss.on("close", () => {
    clearInterval(heartbeat);
  });

  return wss;
}

/**
 * Route incoming messages to the appropriate handler
 */
async function handleMessage(sessionId, user, session, message, ws) {
  const { type, data } = message;

  switch (type) {
    case "chat":
      // User sent a chat message — forward to AI handler
      await handleChatMessage(sessionId, user, session, data, ws);
      break;

    case "workspace_update":
      // User updated their workspace (code, diagram, notes)
      await handleWorkspaceUpdate(sessionId, data, ws);
      break;

    case "phase_change":
      // User manually moved to next phase
      await handlePhaseChange(sessionId, data, ws);
      break;

    case "end_interview":
      // User ended the interview
      await handleEndInterview(sessionId, user, ws);
      break;

    case "ping":
      sendMessage(ws, { type: "pong" });
      break;

    default:
      sendMessage(ws, {
        type: "error",
        data: { message: `Unknown message type: ${type}` },
      });
  }
}

/**
 * Handle a chat message from the user
 * This is where LangChain will be integrated in Step 3
 */
async function handleChatMessage(sessionId, user, session, data, ws) {
  const { content, workspaceSnapshot } = data;

  if (!content || !content.trim()) return;

  // Store user message in database
  await prisma.interviewMessage.create({
    data: {
      sessionId,
      role: "user",
      content: content.trim(),
      workspaceSnapshot: workspaceSnapshot
        ? JSON.stringify(workspaceSnapshot)
        : null,
      phase: data.currentPhase || null,
    },
  });

  // Send acknowledgment
  sendMessage(ws, {
    type: "message_received",
    data: { role: "user", content: content.trim() },
  });

  // Placeholder: AI response will be handled by LangChain in Step 3
  // For now, send a placeholder response
  sendMessage(ws, {
    type: "ai_typing",
    data: { typing: true },
  });

  // TODO: Replace with LangChain conversation engine in Step 3
  setTimeout(() => {
    sendMessage(ws, {
      type: "ai_message",
      data: {
        role: "assistant",
        content: `[AI interviewer placeholder] I received your message: "${content.trim().slice(0, 50)}...". The LangChain conversation engine will be connected in Step 3.`,
        phase: data.currentPhase,
      },
    });
    sendMessage(ws, {
      type: "ai_typing",
      data: { typing: false },
    });
  }, 1000);
}

/**
 * Handle workspace updates (code, diagram, notes)
 */
async function handleWorkspaceUpdate(sessionId, data, ws) {
  const { workspace } = data;

  if (!workspace) return;

  // Update session workspace in database
  await prisma.interviewSession.update({
    where: { id: sessionId },
    data: { workspace: JSON.stringify(workspace) },
  });

  sendMessage(ws, {
    type: "workspace_saved",
    data: { timestamp: new Date().toISOString() },
  });
}

/**
 * Handle phase changes
 */
async function handlePhaseChange(sessionId, data, ws) {
  const { phaseName, phases } = data;

  await prisma.interviewSession.update({
    where: { id: sessionId },
    data: { phases: JSON.stringify(phases) },
  });

  // Store phase change as a system message
  await prisma.interviewMessage.create({
    data: {
      sessionId,
      role: "system",
      content: `Phase changed to: ${phaseName}`,
      phase: phaseName,
    },
  });

  sendMessage(ws, {
    type: "phase_updated",
    data: { phaseName, timestamp: new Date().toISOString() },
  });
}

/**
 * Handle ending the interview
 */
async function handleEndInterview(sessionId, user, ws) {
  await prisma.interviewSession.update({
    where: { id: sessionId },
    data: {
      status: "COMPLETED",
      endedAt: new Date(),
    },
  });

  // Store end message
  await prisma.interviewMessage.create({
    data: {
      sessionId,
      role: "system",
      content: "Interview ended by candidate",
    },
  });

  sendMessage(ws, {
    type: "interview_ended",
    data: {
      sessionId,
      endedAt: new Date().toISOString(),
      message: "Interview session completed. Generating debrief...",
    },
  });

  // Close the connection
  setTimeout(() => {
    ws.close(1000, "Interview completed");
    activeConnections.delete(sessionId);
  }, 2000);
}

/**
 * Send a JSON message through WebSocket
 */
function sendMessage(ws, message) {
  if (ws.readyState === 1) {
    // WebSocket.OPEN
    ws.send(JSON.stringify(message));
  }
}

/**
 * Get active connection for a session
 */
export function getConnection(sessionId) {
  return activeConnections.get(sessionId);
}

/**
 * Get active interview handler for a session
 */
export function getInterviewHandler(sessionId) {
  return activeInterviews.get(sessionId);
}

/**
 * Set active interview handler for a session
 */
export function setInterviewHandler(sessionId, handler) {
  activeInterviews.set(sessionId, handler);
}

/**
 * Check if WebSocket is enabled
 */
export function isWebSocketEnabled() {
  return true; // Always enabled — no config needed
}
