ALTER TABLE "MenuItem" ADD COLUMN "offerPriceCents" INTEGER;

CREATE TABLE "PlatformSetting" (
  "key" TEXT PRIMARY KEY,
  "value" TEXT NOT NULL
);
