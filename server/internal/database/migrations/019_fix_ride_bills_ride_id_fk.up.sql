-- Decouple ride_bills from ride_locations:
-- Ride bills store from_location, to_location and fare directly, so they
-- are fully self-contained. Deleting a route must NOT delete historical bills.
-- Change: ON DELETE CASCADE → ON DELETE SET NULL, and allow ride_id to be NULL.

-- 1. Drop the old CASCADE foreign key
ALTER TABLE ride_bills
    DROP CONSTRAINT IF EXISTS ride_bills_ride_id_fkey;

-- 2. Allow ride_id to be NULL (bill survives route deletion)
ALTER TABLE ride_bills
    ALTER COLUMN ride_id DROP NOT NULL;

-- 3. Re-add the foreign key with SET NULL on delete
ALTER TABLE ride_bills
    ADD CONSTRAINT ride_bills_ride_id_fkey
    FOREIGN KEY (ride_id)
    REFERENCES ride_locations(id)
    ON DELETE SET NULL;
