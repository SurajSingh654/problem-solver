import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { optionalTeamContext } from "../middleware/team.middleware.js";
import multer from "multer";
import {
  startInterview,
  getInterview,
  endInterview,
  getInterviewHistory,
  getDebrief,
  transcribeAudio,
} from "../controllers/interview.controller.js";

const router = Router();
router.use(authenticate, optionalTeamContext);

// Audio upload handler — memory storage (no disk writes)
// Max 10MB per audio chunk — 30 second chunks at typical bitrate
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // Accept common audio formats from MediaRecorder
    const allowed = [
      "audio/webm",
      "audio/ogg",
      "audio/mp4",
      "audio/wav",
      "audio/mpeg",
    ];
    if (allowed.includes(file.mimetype) || file.mimetype.startsWith("audio/")) {
      cb(null, true);
    } else {
      cb(new Error("Audio file required"));
    }
  },
});

router.post("/start", startInterview);
router.get("/history/list", getInterviewHistory);

// Phase 4: audio transcription endpoint
// Client sends audio blob → server transcribes → returns text
// Client then sends text via interview:voice_transcript WebSocket message
router.post("/transcribe", audioUpload.single("audio"), transcribeAudio);

router.get("/:sessionId", getInterview);
router.post("/:sessionId/end", endInterview);
router.get("/:sessionId/debrief", getDebrief);

export default router;
