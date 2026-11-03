-- CreateEnum
CREATE TYPE "CourseColumns" AS ENUM ('ONE', 'TWO');

-- AlterTable
ALTER TABLE "Theme" ADD COLUMN     "courseColumns" "CourseColumns" NOT NULL DEFAULT 'ONE';
