-- Rename legacy statuses to correct lifecycle values:
-- pending -> requested, paid -> arrived
-- New flow: requested -> arrived -> in_progress -> completed (+ cancelled)

-- Drop old constraint first, then migrate data, then add new constraint
ALTER TABLE ride_bills DROP CONSTRAINT IF EXISTS ride_bills_status_check;

-- Migrate existing data
UPDATE ride_bills SET status = 'requested' WHERE status = 'pending';
UPDATE ride_bills SET status = 'arrived'   WHERE status = 'paid';

ALTER TABLE ride_bills ADD CONSTRAINT ride_bills_status_check
CHECK (status IN ('requested', 'arrived', 'in_progress', 'completed', 'cancelled'));
