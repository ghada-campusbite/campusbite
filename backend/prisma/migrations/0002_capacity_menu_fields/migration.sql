-- AlterTable
ALTER TABLE "Canteen" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "closeMin" INTEGER,
ADD COLUMN     "maxOrdersPerSlot" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "openMin" INTEGER;

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "category" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "imageUrl" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cancelledBy" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "suspendedAt" TIMESTAMP(3);

