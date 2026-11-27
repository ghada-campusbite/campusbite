CREATE TABLE "Campus" (
  "id" TEXT PRIMARY KEY,
  "universityId" TEXT NOT NULL REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "name" TEXT NOT NULL
);
CREATE INDEX "Campus_universityId_idx" ON "Campus"("universityId");
ALTER TABLE "Canteen" ADD COLUMN "campusId" TEXT REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Canteen_campusId_idx" ON "Canteen"("campusId");
