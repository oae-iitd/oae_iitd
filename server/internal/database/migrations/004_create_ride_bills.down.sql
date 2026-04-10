DROP TRIGGER IF EXISTS trigger_update_ride_bills_updated_at ON ride_bills;
DROP FUNCTION IF EXISTS update_ride_bills_updated_at();
DROP TABLE IF EXISTS ride_bills CASCADE;
