-- Add reason column to ride_bills for admin annotations (e.g. cancellation reason)
ALTER TABLE ride_bills
ADD COLUMN IF NOT EXISTS reason TEXT;

