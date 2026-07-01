CREATE TABLE "ai_usage_daily_counter" (
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_usage_daily_counter_pkey" PRIMARY KEY ("userId", "day")
);

CREATE INDEX "ai_usage_daily_counter_day_idx" ON "ai_usage_daily_counter"("day");
