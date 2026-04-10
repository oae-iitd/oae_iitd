DROP TRIGGER IF EXISTS trigger_update_user_preferences_updated_at ON user_preferences;
DROP FUNCTION IF EXISTS update_user_preferences_updated_at();
DROP TABLE IF EXISTS user_preferences CASCADE;
