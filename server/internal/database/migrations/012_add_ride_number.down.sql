DROP TRIGGER IF EXISTS trigger_generate_ride_number ON ride_bills;
DROP FUNCTION IF EXISTS generate_ride_number();
DROP INDEX IF EXISTS idx_ride_bills_ride_number;
ALTER TABLE ride_bills DROP COLUMN IF EXISTS ride_number;
