-- narracao_em_voz_alta
-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "narration" TEXT;

-- AlterTable
ALTER TABLE "user_preferences" ADD COLUMN     "narration" BOOLEAN NOT NULL DEFAULT true;
