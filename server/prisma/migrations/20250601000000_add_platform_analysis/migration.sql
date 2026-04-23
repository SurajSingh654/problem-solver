-- CreateTable
CREATE TABLE "platform_analyses" (
    "id" TEXT NOT NULL,
    "generatedById" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "metricsSnapshot" JSONB,
    "period" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_analyses_createdAt_idx" ON "platform_analyses"("createdAt" DESC);
