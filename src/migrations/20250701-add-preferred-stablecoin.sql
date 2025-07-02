-- Add preferred_stablecoin column to bots table
DO $$
BEGIN
    -- Check if the preferred_stablecoin column already exists
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'bots'
        AND column_name = 'preferred_stablecoin'
    ) THEN
        -- Add the preferred_stablecoin column with default value 'USDT'
        ALTER TABLE bots 
        ADD COLUMN preferred_stablecoin VARCHAR(10) DEFAULT 'USDT';
        
        -- Log the migration
        INSERT INTO migrations (name, executed_at)
        VALUES ('20250701-add-preferred-stablecoin', NOW());
        
        RAISE NOTICE 'Added preferred_stablecoin column to bots table';
    ELSE
        RAISE NOTICE 'Column preferred_stablecoin already exists in bots table';
    END IF;
END $$;
