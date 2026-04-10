ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_non_driver_username_required,
    DROP CONSTRAINT IF EXISTS users_non_driver_email_required;
ALTER TABLE users
    ALTER COLUMN username SET NOT NULL,
    ALTER COLUMN email    SET NOT NULL;
