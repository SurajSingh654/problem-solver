-- CreateTable: team_memberships
CREATE TABLE "team_memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'MEMBER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "team_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "team_memberships_userId_teamId_key"
    ON "team_memberships"("userId", "teamId");

CREATE INDEX "team_memberships_userId_isActive_idx"
    ON "team_memberships"("userId", "isActive");

CREATE INDEX "team_memberships_teamId_isActive_idx"
    ON "team_memberships"("teamId", "isActive");

-- AddForeignKey
ALTER TABLE "team_memberships"
    ADD CONSTRAINT "team_memberships_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "team_memberships"
    ADD CONSTRAINT "team_memberships_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "teams"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;