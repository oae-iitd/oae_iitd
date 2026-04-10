ALTER TABLE user_preferences
    DROP COLUMN IF EXISTS notif_email,
    DROP COLUMN IF EXISTS notif_ride_updates,
    DROP COLUMN IF EXISTS notif_security_alerts;
