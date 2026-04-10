-- Allow driver accounts to exist without username/email.
ALTER TABLE users
    ALTER COLUMN username DROP NOT NULL,
    ALTER COLUMN email DROP NOT NULL;

-- Backfill existing driver rows by removing legacy placeholder identity fields.
UPDATE users
SET username = NULL,
    email = NULL
WHERE LOWER(role) = 'driver';

-- Non-driver accounts must still have username/email for classic login.
ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_non_driver_username_required,
    DROP CONSTRAINT IF EXISTS users_non_driver_email_required,
    ADD CONSTRAINT users_non_driver_username_required
        CHECK (LOWER(role) = 'driver' OR username IS NOT NULL),
    ADD CONSTRAINT users_non_driver_email_required
        CHECK (LOWER(role) = 'driver' OR email IS NOT NULL);
