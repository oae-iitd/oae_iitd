-- Allow OTP-only driver accounts to store no password hash.
ALTER TABLE users
    ALTER COLUMN password_hash DROP NOT NULL;

-- Backfill existing driver rows by removing legacy placeholder password hashes.
UPDATE users
SET password_hash = NULL
WHERE LOWER(role) = 'driver';

-- Enforce role-specific password rules:
-- - drivers must have NULL password_hash
-- - non-drivers must have non-NULL password_hash
ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_password_hash_by_role,
    ADD CONSTRAINT users_password_hash_by_role
        CHECK (
            (LOWER(role) = 'driver' AND password_hash IS NULL) OR
            (LOWER(role) <> 'driver' AND password_hash IS NOT NULL)
        );
