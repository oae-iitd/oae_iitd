-- Add ride_number column to store formatted ride ID (DDMMYYYYNNN)
ALTER TABLE ride_bills ADD COLUMN IF NOT EXISTS ride_number VARCHAR(50) UNIQUE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_ride_bills_ride_number ON ride_bills(ride_number);

-- Create function to generate daily sequence number for ride bills
CREATE OR REPLACE FUNCTION generate_ride_number()
RETURNS TRIGGER AS $$
DECLARE
    daily_count INTEGER;
    formatted_date VARCHAR(8);
    sequence_num VARCHAR(3);
BEGIN
    -- Format date as DDMMYYYY
    formatted_date := TO_CHAR(NEW.created_at, 'DDMMYYYY');
    
    -- Count bills created on the same day (including this one)
    SELECT COUNT(*) + 1 INTO daily_count
    FROM ride_bills
    WHERE DATE(created_at) = DATE(NEW.created_at)
    AND id < NEW.id;
    
    -- Format sequence as 3-digit number (001, 002, etc.)
    sequence_num := LPAD(daily_count::TEXT, 3, '0');
    
    -- Set ride_number as DDMMYYYYNNN
    NEW.ride_number := formatted_date || sequence_num;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS trigger_generate_ride_number ON ride_bills;

-- Create trigger to automatically generate ride_number on insert
CREATE TRIGGER trigger_generate_ride_number
    BEFORE INSERT ON ride_bills
    FOR EACH ROW
    EXECUTE FUNCTION generate_ride_number();

-- Backfill existing ride_numbers for existing records
DO $$
DECLARE
    bill_record RECORD;
    daily_count INTEGER;
    formatted_date VARCHAR(8);
    sequence_num VARCHAR(3);
BEGIN
    FOR bill_record IN 
        SELECT id, created_at 
        FROM ride_bills 
        WHERE ride_number IS NULL
        ORDER BY created_at, id
    LOOP
        -- Format date as DDMMYYYY
        formatted_date := TO_CHAR(bill_record.created_at, 'DDMMYYYY');
        
        -- Count bills created on the same day before this one
        SELECT COUNT(*) + 1 INTO daily_count
        FROM ride_bills
        WHERE DATE(created_at) = DATE(bill_record.created_at)
        AND id < bill_record.id;
        
        -- Format sequence as 3-digit number
        sequence_num := LPAD(daily_count::TEXT, 3, '0');
        
        -- Update ride_number
        UPDATE ride_bills
        SET ride_number = formatted_date || sequence_num
        WHERE id = bill_record.id;
    END LOOP;
END $$;
