-- Remove distance column from ride_bills (no longer used)
ALTER TABLE ride_bills DROP COLUMN IF EXISTS distance;
