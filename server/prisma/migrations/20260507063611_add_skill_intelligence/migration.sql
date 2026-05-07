-- AlterTable
ALTER TABLE "feedback_reports" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "skill_assessments" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "skill_profiles" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "idx_assessment_responses_assessment" RENAME TO "assessment_responses_assessmentId_idx";

-- RenameIndex
ALTER INDEX "idx_problems_assessment" RENAME TO "problems_isAssessmentOnly_category_idx";

-- RenameIndex
ALTER INDEX "idx_skill_assessments_status" RENAME TO "skill_assessments_userId_status_idx";

-- RenameIndex
ALTER INDEX "idx_skill_assessments_user" RENAME TO "skill_assessments_userId_idx";

-- RenameIndex
ALTER INDEX "idx_skill_assessments_user_skill" RENAME TO "skill_assessments_userId_skillId_idx";

-- RenameIndex
ALTER INDEX "idx_skill_profiles_score" RENAME TO "skill_profiles_userId_decayedScore_idx";

-- RenameIndex
ALTER INDEX "idx_skill_profiles_user" RENAME TO "skill_profiles_userId_idx";

-- RenameIndex
ALTER INDEX "idx_skill_profiles_user_category" RENAME TO "skill_profiles_userId_skillCategory_idx";

-- RenameIndex
ALTER INDEX "idx_skill_profiles_verified" RENAME TO "skill_profiles_userId_isVerified_idx";
