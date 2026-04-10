ALTER TABLE ride_bills DROP CONSTRAINT IF EXISTS ride_bills_ride_id_fkey;
ALTER TABLE ride_bills ALTER COLUMN ride_id SET NOT NULL;
ALTER TABLE ride_bills
    ADD CONSTRAINT ride_bills_ride_id_fkey
    FOREIGN KEY (ride_id)
    REFERENCES ride_locations(id)
    ON DELETE CASCADE;
