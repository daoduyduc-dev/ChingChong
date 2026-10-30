CREATE UNIQUE INDEX "Session_one_control_session_per_user" ON "Session"("userId") WHERE "revokedAt" IS NULL AND "userId" IS NOT NULL;
ALTER TABLE "Match" ADD CONSTRAINT "Match_distinct_players" CHECK ("red" <> "black");
ALTER TABLE "Match" ADD CONSTRAINT "Match_positive_version" CHECK ("version" > 0);
ALTER TABLE "Move" ADD CONSTRAINT "Move_positive_sequence" CHECK ("sequence" > 0);
ALTER TABLE "Room" ADD CONSTRAINT "Room_six_digits" CHECK ("code" ~ '^[0-9]{6}$');
ALTER TABLE "Room" ADD CONSTRAINT "Room_two_seats" CHECK (jsonb_array_length("state"->'seats') BETWEEN 0 AND 2);
