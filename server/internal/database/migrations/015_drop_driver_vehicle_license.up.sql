-- Remove driver-only fields: license_number, vehicle_number, vehicle_type
ALTER TABLE users
  DROP COLUMN IF EXISTS license_number,
  DROP COLUMN IF EXISTS vehicle_number,
  DROP COLUMN IF EXISTS vehicle_type;
