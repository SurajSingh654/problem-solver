// ============================================================================
// Learn-AI request schemas — Zod validation for /api/v1/learn-ai/* bodies.
// ============================================================================
//
// Field shapes mirror the Python tool signatures in:
//   project/src/learning_assistant/mcp_servers/repo_brain/server.py
//
// Bounds are tighter than the Python side defaults so a stray client can't
// blow up a Node worker (k=1000 would cap at 20; an 80KB snippet at 8000).
// `default(...)` lets the client omit the field; the validate middleware
// rewrites req.body with the parsed/transformed values.
// ============================================================================

import { z } from "zod";

export const searchCodeSchema = z.object({
  query: z.string().min(1).max(500),
  k: z.number().int().min(1).max(20).default(5),
  ext: z.string().max(20).optional(),
  rerank: z.boolean().default(false),
});

export const searchDocsSchema = z.object({
  query: z.string().min(1).max(500),
  k: z.number().int().min(1).max(20).default(5),
  rerank: z.boolean().default(false),
});

export const findSimilarSchema = z.object({
  snippet: z.string().min(1).max(8000),
  k: z.number().int().min(1).max(20).default(5),
});

export const explainSymbolSchema = z.object({
  name: z.string().min(1).max(200),
  file_hint: z.string().max(500).optional(),
});

export const recentChangesSchema = z.object({
  path: z.string().min(1).max(500),
  n: z.number().int().min(1).max(50).default(10),
});

export const readChunkSchema = z.object({
  chunk_id: z.string().min(1).max(500),
});

export const deepExplainSchema = z.object({
  question: z.string().min(1).max(1000),
});
