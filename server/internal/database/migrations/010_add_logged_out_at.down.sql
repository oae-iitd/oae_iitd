DROP INDEX IF EXISTS idx_sessions_logged_out_at;
ALTER TABLE sessions DROP COLUMN IF EXISTS logged_out_at;
