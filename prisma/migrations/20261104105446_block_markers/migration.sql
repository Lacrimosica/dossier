-- CreateEnum
CREATE TYPE "MarkerStyle" AS ENUM ('NONE', 'LINE', 'TINT');

-- CreateEnum
CREATE TYPE "MarkerScope" AS ENUM ('MULTI_ROLE', 'COMPANIES', 'SECTIONS');

-- AlterTable
ALTER TABLE "Theme" ADD COLUMN     "markerScope" "MarkerScope" NOT NULL DEFAULT 'SECTIONS',
ADD COLUMN     "markerStyle" "MarkerStyle" NOT NULL DEFAULT 'NONE';
