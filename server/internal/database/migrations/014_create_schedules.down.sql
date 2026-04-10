DROP TRIGGER IF EXISTS trigger_update_schedules_updated_at ON schedules;
DROP FUNCTION IF EXISTS update_schedules_updated_at();
DROP TABLE IF EXISTS schedules CASCADE;
