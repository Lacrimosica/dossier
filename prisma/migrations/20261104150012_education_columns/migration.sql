-- CreateEnum
CREATE TYPE "EducationColumns" AS ENUM ('ONE', 'TWO');

-- AlterTable
ALTER TABLE "Theme" ADD COLUMN     "educationColumns" "EducationColumns" NOT NULL DEFAULT 'ONE';
