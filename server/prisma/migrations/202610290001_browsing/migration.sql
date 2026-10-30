ALTER TABLE "Match" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "Match" ADD CONSTRAINT "Match_mode_valid" CHECK ("mode" IN ('UNKNOWN','PUBLIC','PRIVATE','RANDOM'));
CREATE INDEX "Match_createdAt_id_idx" ON "Match"("createdAt", "id");
CREATE INDEX "Match_mode_status_createdAt_id_idx" ON "Match"("mode", "status", "createdAt", "id");
CREATE INDEX "Report_createdAt_id_idx" ON "Report"("createdAt", "id");
CREATE INDEX "Audit_createdAt_id_idx" ON "Audit"("createdAt", "id");
CREATE INDEX "User_createdAt_id_idx" ON "User"("createdAt", "id");
