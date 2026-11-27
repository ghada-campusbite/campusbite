-- Pickup codes move from plaintext to AES-256-GCM encrypted values written by
-- the API. Pre-launch there is no real data; any fictional rows lose their code
-- (only relevant for ACTIVE orders), which is acceptable before first deploy.
ALTER TABLE "Order" ADD COLUMN "pickupCodeEnc" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Order" DROP COLUMN "pickupCode";
