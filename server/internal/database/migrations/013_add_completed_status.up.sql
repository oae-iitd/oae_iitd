-- Add 'completed' status to ride_bills table
-- This allows rides to be marked as completed when passengers arrive

-- Drop existing check constraint
ALTER TABLE ride_bills DROP CONSTRAINT IF EXISTS ride_bills_status_check;

-- Add new check constraint with 'completed' status
ALTER TABLE ride_bills ADD CONSTRAINT ride_bills_status_check
CHECK (status IN ('pending', 'completed', 'paid', 'cancelled'));