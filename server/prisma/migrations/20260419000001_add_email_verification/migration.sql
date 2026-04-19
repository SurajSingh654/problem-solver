ALTER TABLE "users" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "verificationCode" TEXT;
ALTER TABLE "users" ADD COLUMN "verificationExpiry" TIMESTAMP(3);