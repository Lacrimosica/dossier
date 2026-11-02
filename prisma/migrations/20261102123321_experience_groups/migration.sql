-- CreateEnum
CREATE TYPE "GroupSection" AS ENUM ('EXPERIENCE');

-- AlterTable
ALTER TABLE "Experience" ADD COLUMN     "groupId" TEXT;

-- CreateTable
CREATE TABLE "EntryGroup" (
    "id" TEXT NOT NULL,
    "section" "GroupSection" NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntryGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Experience_groupId_idx" ON "Experience"("groupId");

-- AddForeignKey
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "EntryGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
