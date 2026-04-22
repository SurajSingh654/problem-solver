// ============================================================================
// ProbSolver v3.0 — WebSocket Service (Team-Scoped)
// ============================================================================
//
// DESIGN DECISIONS:
//
// 1. JWT auth on connection: The client sends the JWT as a URL query
//    parameter (ws://host/ws?token=xxx). We verify it during the
//    HTTP upgrade, BEFORE the WebSocket connection is established.
//    Rejected connections never get a socket.
//
// 2. Team context on socket: After auth, ws.userId, ws.teamId, and
//    ws.teamRole are stored on the socket object. Every message
//    handler and tool execution reads teamId from the socket — never
//    from the message payload. This prevents a client from spoofing
//    team context.
//
// 3. Tool execution context: The interview engine's function calling
//    tools (getProblemDetails, getCandidateProfile, searchTeammates,
//    etc.) all receive a `context` object containing teamId. They
//    use it in every database query.
//
// 4. Heartbeat: 30-second ping/pong to detect dead connections.
//    Railway terminates idle connections after 60 seconds, so the
//    heartbeat keeps them alive during interview think-time.
//
// ============================================================================

import { WebSocketServer } from 'ws'
import { verifyToken } from '../lib/jwt.js'
import { handleInterviewMessage } from './interview.engine.js'
import prisma from '../lib/prisma.js'

const HEARTBEAT_INTERVAL = 30000

export function setupWebSocket(server) {
  const wss = new WebSocketServer({ noServer: true })

  // ── HTTP Upgrade: authenticate before accepting ────────
  server.on('upgrade', (request, socket, head) => {
    try {
      // Extract token from URL query parameter
      const url = new URL(request.url, `http://${request.headers.host}`)
      const token = url.searchParams.get('token')

      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
      }

      // Verify JWT
      const decoded = verifyToken(token)

      // Attach user context to the request for the connection handler
      request.userId = decoded.id
      request.globalRole = decoded.globalRole
      request.teamId = decoded.currentTeamId || null
      request.teamRole = decoded.teamRole || null

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request)
      })
    } catch (err) {
      console.error('WebSocket auth failed:', err.message)
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
    }
  })

  // ── Connection handler ─────────────────────────────────
  wss.on('connection', (ws, request) => {
    // Store user + team context on the socket
    ws.userId = request.userId
    ws.globalRole = request.globalRole
    ws.teamId = request.teamId
    ws.teamRole = request.teamRole
    ws.isAlive = true
    ws.sessionId = null

    console.log(`🔌 WS connected: user=${ws.userId} team=${ws.teamId}`)

    // ── Heartbeat ──────────────────────────────────────
    ws.on('pong', () => { ws.isAlive = true })

    // ── Message handler ────────────────────────────────
    ws.on('message', async (raw) => {
      try {
        const message = JSON.parse(raw.toString())

        switch (message.type) {
          case 'interview:start':
            await handleStart(ws, message)
            break

          case 'interview:message':
            await handleMessage(ws, message)
            break

          case 'interview:workspace':
            await handleWorkspace(ws, message)
            break

          case 'interview:end':
            await handleEnd(ws, message)
            break

          default:
            ws.send(JSON.stringify({
              type: 'error',
              error: `Unknown message type: ${message.type}`,
            }))
        }
      } catch (err) {
        console.error('WS message error:', err)
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Failed to process message.',
        }))
      }
    })

    // ── Disconnect cleanup ─────────────────────────────
    ws.on('close', () => {
      console.log(`🔌 WS disconnected: user=${ws.userId}`)

      // Mark session as abandoned if still in progress
      if (ws.sessionId) {
        prisma.interviewSession.updateMany({
          where: {
            id: ws.sessionId,
            userId: ws.userId,
            status: 'IN_PROGRESS',
          },
          data: { status: 'ABANDONED' },
        }).catch(() => {})
      }
    })
  })

  // ── Heartbeat interval ─────────────────────────────────
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        console.log(`💀 WS dead connection: user=${ws.userId}`)
        return ws.terminate()
      }
      ws.isAlive = false
      ws.ping()
    })
  }, HEARTBEAT_INTERVAL)

  wss.on('close', () => clearInterval(heartbeat))

  console.log('🔌 WebSocket server initialized')
  return wss
}

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================

async function handleStart(ws, message) {
  const { sessionId } = message

  if (!sessionId) {
    ws.send(JSON.stringify({ type: 'error', error: 'Session ID required.' }))
    return
  }

  // ── Verify session belongs to this user ──────────────
  const session = await prisma.interviewSession.findFirst({
    where: {
      id: sessionId,
      userId: ws.userId,
      status: 'IN_PROGRESS',
    },
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
          followUpQuestions: {
            orderBy: { order: 'asc' },
          },
        },
      },
    },
  })

  if (!session) {
    ws.send(JSON.stringify({ type: 'error', error: 'Session not found or already ended.' }))
    return
  }

  // ── Verify team context matches ──────────────────────
  // Session's teamId must match the socket's teamId
  if (session.teamId && session.teamId !== ws.teamId) {
    ws.send(JSON.stringify({
      type: 'error',
      error: 'Team context mismatch. Please refresh and try again.',
    }))
    return
  }

  ws.sessionId = sessionId

  // ── Build the tool execution context ─────────────────
  // This context is passed to every function calling tool
  const toolContext = {
    userId: ws.userId,
    teamId: ws.teamId,        // CRITICAL: scopes all tool queries
    sessionId,
    problemId: session.problemId,
    category: session.category,
    interviewStyle: session.interviewStyle,
  }

  ws.toolContext = toolContext

  ws.send(JSON.stringify({
    type: 'interview:started',
    session: {
      id: session.id,
      category: session.category,
      difficulty: session.difficulty,
      interviewStyle: session.interviewStyle,
      problem: session.problem,
      phases: session.phases,
    },
  }))

  // ── Generate initial AI message ──────────────────────
  await handleInterviewMessage(ws, {
    type: 'system_init',
    session,
    toolContext,
  })
}

async function handleMessage(ws, message) {
  if (!ws.sessionId || !ws.toolContext) {
    ws.send(JSON.stringify({ type: 'error', error: 'No active session.' }))
    return
  }

  const { content, workspace } = message

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    ws.send(JSON.stringify({ type: 'error', error: 'Message content required.' }))
    return
  }

  // ── Store user message ───────────────────────────────
  await prisma.interviewMessage.create({
    data: {
      sessionId: ws.sessionId,
      role: 'USER',
      content: content.trim(),
      workspaceSnapshot: workspace || null,
    },
  })

  // ── Pass to interview engine with team context ───────
  await handleInterviewMessage(ws, {
    type: 'user_message',
    content: content.trim(),
    workspace,
    toolContext: ws.toolContext,
  })
}

async function handleWorkspace(ws, message) {
  if (!ws.sessionId) return

  const { workspace } = message

  // Update session workspace (fire-and-forget)
  prisma.interviewSession.update({
    where: { id: ws.sessionId },
    data: { workspace },
  }).catch(() => {})
}

async function handleEnd(ws, message) {
  if (!ws.sessionId) return

  // ── Trigger debrief generation ───────────────────────
  await handleInterviewMessage(ws, {
    type: 'end_interview',
    toolContext: ws.toolContext,
  })

  ws.sessionId = null
  ws.toolContext = null
}