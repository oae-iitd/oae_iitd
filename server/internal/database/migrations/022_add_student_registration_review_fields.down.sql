DROP INDEX IF EXISTS idx_users_approval_status;
ALTER TABLE users
    DROP COLUMN IF EXISTS approval_status,
    DROP COLUMN IF EXISTS approval_reason;
