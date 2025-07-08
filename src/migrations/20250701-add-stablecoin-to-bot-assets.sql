-- Add stablecoin column to bot_assets table
DO $$
BEGIN
    -- Check if the stablecoin column already exists
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'bot_assets'
        AND column_name = 'stablecoin'
    ) THEN
        -- Add the stablecoin column with default value 'USDT'
        ALTER TABLE bot_assets 
        ADD COLUMN stablecoin VARCHAR(10) DEFAULT 'USDT';
        
        -- Log the migration
        INSERT INTO migrations (name, executed_at)
        VALUES ('20250701-add-stablecoin-to-bot-assets', NOW());
        
        RAISE NOTICE 'Added stablecoin column to bot_assets table';
    ELSE
        RAISE NOTICE 'Column stablecoin already exists in bot_assets table';
    END IF;
END $$;
