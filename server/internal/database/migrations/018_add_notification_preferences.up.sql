-- Add notification preference columns to user_preferences
ALTER TABLE user_preferences
    ADD COLUMN IF NOT EXISTS notif_email         BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS notif_ride_updates  BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS notif_security_alerts BOOLEAN NOT NULL DEFAULT TRUE;
