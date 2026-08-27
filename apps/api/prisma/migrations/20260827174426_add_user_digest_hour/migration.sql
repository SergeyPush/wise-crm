-- AlterTable
ALTER TABLE "User" ADD COLUMN     "digestHour" INTEGER NOT NULL DEFAULT 8;

-- CreateIndex
CREATE INDEX "User_isActive_digestHour_idx" ON "User"("isActive", "digestHour");
