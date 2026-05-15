import { WebSocketServer } from "ws";
import { verifyToken } from "../lib/jwt.js";
import { handleInterviewMessage } from "./interview.engine.js";
import prisma from "../lib/prisma.js";

const HEARTBEAT_INTERVAL = 30000;

// Module-level reference so other services (teaching scheduler, REST
// controllers that need to push presence updates from non-WS code paths)
// can broadcast without holding a wss handle. Set on `setupWebSocket()`.
let _wssRef = null;

// Close every connected ws cleanly during graceful shutdown. Used by the
// SIGTERM handler in index.js so deploys don't drop active interview /
// design / teaching sessions with ECONNRESET.
//
// Sends a 1000 (normal closure) frame with reason; client UIs can read this
// and surface "server restarting, reconnecting…" instead of an error toast.
// Returns the number of sockets closed (informational; useful in logs).
export function closeAllWebSockets(reason = "server restarting") {
  if (!_wssRef) return 0;
  let count = 0;
  for (const ws of _wssRef.clients) {
    try {
      if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) {
        ws.close(1000, reason);
        count++;
      }
    } catch {
      // Ignore — best-effort drain.
    }
  }
  return count;
}

// Broadcast to every connected ws scoped to a given team. Used by the
// teaching scheduler ("starting_soon", "live_now") and the teaching
// controller's `:end` handler to push status flips to the room.
// Safe no-op before setupWebSocket runs.
export function broadcastToTeam(teamId, message) {
  if (!_wssRef || !teamId) return;
  const payload = JSON.stringify(message);
  for (const ws of _wssRef.clients) {
    if (ws.readyState === ws.OPEN && ws.teamId === teamId) {
      try {
        ws.send(payload);
      } catch {
        // Drop quietly — a partial fan-out failure isn't fatal.
      }
    }
  }
}

// Broadcast to every ws that has joined the same teaching session room
// (`ws.teachingSessionId === sessionId`). Used for `attendee_joined`,
// `attendee_left`, `question`, `answer` fan-out where only the room
// participants need the message.
function broadcastToTeachingRoom(wss, sessionId, message, excludeWs = null) {
  if (!sessionId) return;
  const payload = JSON.stringify(message);
  for (const ws of wss.clients) {
    if (
      ws !== excludeWs &&
      ws.readyState === ws.OPEN &&
      ws.teachingSessionId === sessionId
    ) {
      try {
        ws.send(payload);
      } catch {
        // ignore
      }
    }
  }
}

export function setupWebSocket(server) {
  const wss = new WebSocketServer({ noServer: true });
  _wssRef = wss;

  server.on("upgrade", (request, socket, head) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const token = url.searchParams.get("token");
      if (!token) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      const decoded = verifyToken(token);
      request.userId = decoded.id;
      request.globalRole = decoded.globalRole;
      request.teamId = decoded.currentTeamId || null;
      request.teamRole = decoded.teamRole || null;
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } catch (err) {
      console.error("WebSocket auth failed:", err.message);
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
    }
  });

  wss.on("connection", (ws, request) => {
    ws.userId = request.userId;
    ws.globalRole = request.globalRole;
    ws.teamId = request.teamId;
    ws.teamRole = request.teamRole;
    ws.isAlive = true;
    ws.sessionId = null;
    ws.interviewMode = "text"; // Phase 4: track mode per connection
    // Teaching live-room — set by `teaching:join` / cleared by
    // `teaching:leave` or close. One connection = one teaching room
    // (you can't be in two rooms at once on the same socket).
    ws.teachingSessionId = null;

    console.log(`🔌 WS connected: user=${ws.userId} team=${ws.teamId}`);

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", async (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        switch (message.type) {
          case "interview:start":
            await handleStart(ws, message);
            break;
          case "interview:message":
            await handleMessage(ws, message);
            break;
          case "interview:workspace":
            await handleWorkspace(ws, message);
            break;
          case "interview:end":
            await handleEnd(ws, message);
            break;

          // ── Phase 4: Voice interview handlers ──────────────

          // Receives Whisper transcript from client
          // Treated identically to a text message by the engine
          // but stored with isVoice flag for debrief analysis
          case "interview:voice_transcript":
            await handleVoiceTranscript(ws, message);
            break;

          // Phase 4 hook: behavioral signals from audio analysis
          // Client sends: filler word counts, speaking pace, hesitation markers
          // Stored in workspace for debrief context
          // No processing here — pure storage for now
          case "interview:behavioral_signal":
            await handleBehavioralSignal(ws, message);
            break;

          // ── Teaching Sessions live room (P1) ─────────────
          // Presence + Q&A only. The actual meeting runs on the host's
          // external link; the in-app room is just attendance + chat.
          case "teaching:join":
            await handleTeachingJoin(wss, ws, message);
            break;
          case "teaching:leave":
            await handleTeachingLeave(wss, ws, message);
            break;
          case "teaching:question":
            handleTeachingQuestion(wss, ws, message);
            break;
          case "teaching:answer":
            handleTeachingAnswer(wss, ws, message);
            break;

          default:
            ws.send(
              JSON.stringify({
                type: "error",
                error: `Unknown message type: ${message.type}`,
              }),
            );
        }
      } catch (err) {
        console.error("WS message error:", err);
        ws.send(
          JSON.stringify({
            type: "error",
            error: "Failed to process message.",
          }),
        );
      }
    });

    ws.on("close", () => {
      console.log(`🔌 WS disconnected: user=${ws.userId}`);
      if (ws.sessionId) {
        prisma.interviewSession
          .updateMany({
            where: {
              id: ws.sessionId,
              userId: ws.userId,
              status: "IN_PROGRESS",
            },
            data: { status: "ABANDONED" },
          })
          .catch(() => {});
      }
      // Teaching room: notify peers this attendee dropped + write
      // leftAt so the attendee record reflects reality. Fire-and-forget;
      // a second join from a reload re-opens a fresh row.
      if (ws.teachingSessionId) {
        const sessionId = ws.teachingSessionId;
        const userId = ws.userId;
        broadcastToTeachingRoom(wss, sessionId, {
          type: "teaching:attendee_left",
          sessionId,
          userId,
        });
        prisma.teachingAttendee
          .updateMany({
            where: { sessionId, userId, leftAt: null },
            data: { leftAt: new Date() },
          })
          .catch(() => {});
        ws.teachingSessionId = null;
      }
    });
  });

  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        console.log(`💀 WS dead connection: user=${ws.userId}`);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_INTERVAL);

  wss.on("close", () => clearInterval(heartbeat));
  console.log("🔌 WebSocket server initialized");
  return wss;
}

// ============================================================================
// EXISTING MESSAGE HANDLERS (unchanged)
// ============================================================================
async function handleStart(ws, message) {
  const { sessionId } = message;
  if (!sessionId) {
    ws.send(JSON.stringify({ type: "error", error: "Session ID required." }));
    return;
  }
  const session = await prisma.interviewSession.findFirst({
    where: { id: sessionId, userId: ws.userId, status: "IN_PROGRESS" },
    include: {
      problem: {
        select: {
          id: true,
          title: true,
          description: true,
          category: true,
          difficulty: true,
          adminNotes: true,
          categoryData: true,
          followUpQuestions: { orderBy: { order: "asc" } },
        },
      },
    },
  });
  if (!session) {
    ws.send(
      JSON.stringify({
        type: "error",
        error: "Session not found or already ended.",
      }),
    );
    return;
  }
  if (session.teamId && session.teamId !== ws.teamId) {
    ws.send(
      JSON.stringify({
        type: "error",
        error: "Team context mismatch. Please refresh and try again.",
      }),
    );
    return;
  }

  ws.sessionId = sessionId;
  // Phase 4: store interview mode on socket for response routing
  ws.interviewMode = session.workspace?.interviewMode || "text";

  const toolContext = {
    userId: ws.userId,
    teamId: ws.teamId,
    sessionId,
    problemId: session.problemId,
    category: session.category,
    interviewStyle: session.interviewStyle,
    interviewMode: ws.interviewMode, // Phase 4: engine knows the mode
  };
  ws.toolContext = toolContext;

  ws.send(
    JSON.stringify({
      type: "interview:started",
      session: {
        id: session.id,
        category: session.category,
        difficulty: session.difficulty,
        interviewStyle: session.interviewStyle,
        problem: session.problem,
        phases: session.phases,
        interviewMode: ws.interviewMode, // Phase 4: client knows the mode
      },
    }),
  );

  await handleInterviewMessage(ws, {
    type: "system_init",
    session,
    toolContext,
  });
}

async function handleMessage(ws, message) {
  if (!ws.sessionId || !ws.toolContext) {
    ws.send(JSON.stringify({ type: "error", error: "No active session." }));
    return;
  }
  const { content, workspace } = message;
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    ws.send(
      JSON.stringify({ type: "error", error: "Message content required." }),
    );
    return;
  }
  await prisma.interviewMessage.create({
    data: {
      sessionId: ws.sessionId,
      role: "USER",
      content: content.trim(),
      workspaceSnapshot: workspace || null,
    },
  });
  await handleInterviewMessage(ws, {
    type: "user_message",
    content: content.trim(),
    workspace,
    toolContext: ws.toolContext,
  });
}

async function handleWorkspace(ws, message) {
  if (!ws.sessionId) return;
  const { workspace } = message;
  prisma.interviewSession
    .update({
      where: { id: ws.sessionId },
      data: { workspace },
    })
    .catch(() => {});
}

async function handleEnd(ws, _message) {
  if (!ws.sessionId) return;
  await handleInterviewMessage(ws, {
    type: "end_interview",
    toolContext: ws.toolContext,
  });
  ws.sessionId = null;
  ws.toolContext = null;
}

// ============================================================================
// PHASE 4: VOICE MESSAGE HANDLERS
// ============================================================================

// Handles Whisper transcript from voice interview
// Treated identically to text message by the engine — same AI, same prompts,
// same debrief. Voice is just a different input channel, not a different experience.
// The AI response text is flagged as voice_response so client speaks it.
async function handleVoiceTranscript(ws, message) {
  if (!ws.sessionId || !ws.toolContext) {
    ws.send(JSON.stringify({ type: "error", error: "No active session." }));
    return;
  }

  const { transcript, workspace, audioMetadata } = message;

  if (
    !transcript ||
    typeof transcript !== "string" ||
    transcript.trim().length === 0
  ) {
    ws.send(JSON.stringify({ type: "error", error: "Transcript required." }));
    return;
  }

  const cleanTranscript = transcript.trim();

  // Store as USER message with voice metadata
  // The isVoice flag enables voice-specific debrief analysis later
  await prisma.interviewMessage.create({
    data: {
      sessionId: ws.sessionId,
      role: "USER",
      content: cleanTranscript,
      workspaceSnapshot: workspace || null,
      // Store voice metadata in toolResults field (repurposed for voice metadata)
      // We use existing JSON field to avoid schema change
      toolResults: audioMetadata
        ? [
            JSON.stringify({
              isVoice: true,
              duration: audioMetadata.duration,
              wordsPerMinute: audioMetadata.wordsPerMinute,
              fillerWordCount: audioMetadata.fillerWordCount,
            }),
          ]
        : [JSON.stringify({ isVoice: true })],
    },
  });

  // Echo transcript back so client can display it in the chat
  ws.send(
    JSON.stringify({
      type: "interview:transcript",
      transcript: cleanTranscript,
    }),
  );

  // Route to engine — identical path to text messages
  // The engine doesn't need to know it came from voice
  // The AI response will have isVoice: true flag so client speaks it
  await handleInterviewMessage(ws, {
    type: "user_message",
    content: cleanTranscript,
    workspace,
    toolContext: ws.toolContext,
    isVoice: true, // tells engine to flag response for TTS
  });
}

// Stores behavioral signals from client-side audio analysis
// Currently: filler words, speaking pace, hesitation duration
// Future: tone, confidence, stress markers from audio features
// Zero processing server-side — pure storage for debrief context
async function handleBehavioralSignal(ws, message) {
  if (!ws.sessionId) return;

  const { signal } = message;
  // signal shape: { type: 'filler_word' | 'long_pause' | 'speaking_pace', value: any }

  if (!signal?.type) return;

  // Store as SYSTEM message for debrief access
  await prisma.interviewMessage
    .create({
      data: {
        sessionId: ws.sessionId,
        role: "SYSTEM",
        content: `[BEHAVIORAL_SIGNAL] ${signal.type}: ${JSON.stringify(signal.value)}`,
        phase: "behavioral",
      },
    })
    .catch(() => {}); // fire-and-forget — non-critical
}

// ============================================================================
// TEACHING SESSIONS LIVE ROOM (P1)
// ============================================================================
//
// Presence + Q&A over the existing WebSocket. No video — the actual
// meeting runs on the host's external link. Each ws can be in at most
// one teaching room at a time (`ws.teachingSessionId`). The REST
// endpoints `/teaching/:id/join` and `/teaching/:id/leave` mirror these
// handlers so a page reload still records attendance correctly.
// ============================================================================

async function handleTeachingJoin(wss, ws, message) {
  const { sessionId } = message;
  if (!sessionId) {
    ws.send(JSON.stringify({ type: "error", error: "sessionId required." }));
    return;
  }

  // Verify the user belongs to the team that owns this session.
  const session = await prisma.teachingSession.findFirst({
    where: { id: sessionId, teamId: ws.teamId, deletedAt: null },
    select: { id: true, status: true, hostId: true, capacity: true },
  });
  if (!session) {
    ws.send(
      JSON.stringify({
        type: "error",
        error: "Teaching session not found in your team context.",
      }),
    );
    return;
  }
  if (session.status === "CANCELLED" || session.status === "COMPLETED") {
    ws.send(
      JSON.stringify({
        type: "error",
        error: `Session is ${session.status.toLowerCase()}.`,
      }),
    );
    return;
  }

  // Capacity check — host bypasses, attendees count active rows.
  if (ws.userId !== session.hostId) {
    const activeCount = await prisma.teachingAttendee.count({
      where: { sessionId, leftAt: null },
    });
    if (activeCount >= session.capacity) {
      ws.send(
        JSON.stringify({
          type: "error",
          error: "Session is at capacity.",
        }),
      );
      return;
    }
  }

  // Upsert attendee row. If they previously left, re-open a fresh row
  // (joinedAt = now, leftAt = null) so the attendee table tracks every
  // join cycle, not just first/last. Idempotent against the unique
  // (sessionId, userId) constraint via update-on-conflict semantics.
  await prisma.teachingAttendee.upsert({
    where: { sessionId_userId: { sessionId, userId: ws.userId } },
    create: { sessionId, userId: ws.userId },
    update: { joinedAt: new Date(), leftAt: null, durationMs: null },
  });

  ws.teachingSessionId = sessionId;

  // Tell the joiner they're in.
  ws.send(JSON.stringify({ type: "teaching:joined", sessionId }));

  // Tell everyone else in the room.
  broadcastToTeachingRoom(
    wss,
    sessionId,
    { type: "teaching:attendee_joined", sessionId, userId: ws.userId },
    ws,
  );
}

async function handleTeachingLeave(wss, ws, message) {
  const sessionId = message.sessionId || ws.teachingSessionId;
  if (!sessionId) return;

  const startedAt = await prisma.teachingAttendee.findUnique({
    where: { sessionId_userId: { sessionId, userId: ws.userId } },
    select: { joinedAt: true },
  });

  await prisma.teachingAttendee
    .updateMany({
      where: { sessionId, userId: ws.userId, leftAt: null },
      data: {
        leftAt: new Date(),
        durationMs: startedAt?.joinedAt
          ? Date.now() - new Date(startedAt.joinedAt).getTime()
          : null,
      },
    })
    .catch(() => {});

  if (ws.teachingSessionId === sessionId) ws.teachingSessionId = null;

  broadcastToTeachingRoom(wss, sessionId, {
    type: "teaching:attendee_left",
    sessionId,
    userId: ws.userId,
  });
  ws.send(JSON.stringify({ type: "teaching:left", sessionId }));
}

function handleTeachingQuestion(wss, ws, message) {
  const sessionId = message.sessionId || ws.teachingSessionId;
  if (!sessionId || sessionId !== ws.teachingSessionId) {
    ws.send(
      JSON.stringify({
        type: "error",
        error: "Join the session before asking.",
      }),
    );
    return;
  }
  const text = (message.text || "").trim();
  if (!text) return;
  // Q&A is in-memory in v1 (not persisted). Reload = fresh queue.
  // Each question gets a per-message id so answers can target it.
  const questionId = `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  broadcastToTeachingRoom(wss, sessionId, {
    type: "teaching:question",
    sessionId,
    questionId,
    askerId: ws.userId,
    text,
    askedAt: new Date().toISOString(),
  });
}

function handleTeachingAnswer(wss, ws, message) {
  const sessionId = message.sessionId || ws.teachingSessionId;
  if (!sessionId || sessionId !== ws.teachingSessionId) return;
  const { questionId } = message;
  const text = (message.text || "").trim();
  if (!questionId || !text) return;
  broadcastToTeachingRoom(wss, sessionId, {
    type: "teaching:answer",
    sessionId,
    questionId,
    answererId: ws.userId,
    text,
    answeredAt: new Date().toISOString(),
  });
}
