ALTER TABLE "problems" ADD COLUMN "description" TEXT;
ALTER TABLE "problems" ADD COLUMN "categoryData" TEXT NOT NULL DEFAULT '{}';