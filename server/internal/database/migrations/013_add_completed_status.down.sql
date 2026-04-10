ALTER TABLE ride_bills DROP CONSTRAINT IF EXISTS ride_bills_status_check;
ALTER TABLE ride_bills ADD CONSTRAINT ride_bills_status_check
    CHECK (status IN ('pending', 'paid', 'cancelled'));
