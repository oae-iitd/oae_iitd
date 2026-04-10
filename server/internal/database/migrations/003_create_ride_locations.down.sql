DROP TRIGGER IF EXISTS trigger_update_ride_locations_updated_at ON ride_locations;
DROP FUNCTION IF EXISTS update_ride_locations_updated_at();
DROP TABLE IF EXISTS ride_locations CASCADE;
