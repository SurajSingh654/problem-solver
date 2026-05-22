-- Adds AI_ENGINEERING to TopicCategory so the Learn section can host
-- AI-engineering curriculum (LLM fundamentals, prompting, embeddings, RAG,
-- tool use, agents, evals, observability) alongside existing domains like
-- SYSTEM_DESIGN and DSA. Additive enum value — safe on prod data.

ALTER TYPE "TopicCategory" ADD VALUE IF NOT EXISTS 'AI_ENGINEERING';
