-- Add embedding columns for vector search (RAG)
ALTER TABLE "problems" ADD COLUMN "embedding" vector(1536);
ALTER TABLE "solutions" ADD COLUMN "embedding" vector(1536);

-- Create indexes for fast similarity search
CREATE INDEX "problems_embedding_idx" ON "problems" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 10);
CREATE INDEX "solutions_embedding_idx" ON "solutions" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 10);