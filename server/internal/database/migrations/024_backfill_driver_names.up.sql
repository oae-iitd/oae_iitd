-- Backfill name from username for drivers where name is NULL
UPDATE users
SET name = username
WHERE LOWER(role) = 'driver'
  AND name IS NULL
  AND username IS NOT NULL;
