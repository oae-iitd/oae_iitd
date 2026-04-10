ALTER TABLE users DROP CONSTRAINT IF EXISTS users_password_hash_by_role;
ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;
