-- Reverse status rename: requested -> pending, arrived -> paid
UPDATE ride_bills SET status = 'pending'  WHERE status = 'requested';
UPDATE ride_bills SET status = 'paid'     WHERE status = 'arrived';

ALTER TABLE ride_bills DROP CONSTRAINT IF EXISTS ride_bills_status_check;
ALTER TABLE ride_bills ADD CONSTRAINT ride_bills_status_check
    CHECK (status IN ('pending', 'completed', 'paid', 'cancelled'));
