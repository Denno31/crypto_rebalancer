-- Migration script to add flexible capital allocation fields to bots table
-- and create the new bot_assets table for tracking ownership

-- First, add new columns to the bots table
ALTER TABLE "bots" 
  ADD COLUMN IF NOT EXISTS "allocation_percentage" FLOAT DEFAULT 100.0,
  ADD COLUMN IF NOT EXISTS "manual_budget_amount" FLOAT;

-- Create the bot_assets table for tracking which bot owns which assets
CREATE TABLE IF NOT EXISTS "bot_assets" (
  "id" SERIAL PRIMARY KEY,
  "bot_id" INTEGER NOT NULL REFERENCES "bots"("id") ON DELETE CASCADE,
  "coin" VARCHAR(255) NOT NULL,
  "amount" FLOAT NOT NULL DEFAULT 0.0,
  "entry_price" FLOAT,
  "usdt_equivalent" FLOAT,
  "last_updated" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS "bot_assets_bot_id_idx" ON "bot_assets" ("bot_id");
CREATE INDEX IF NOT EXISTS "bot_assets_coin_idx" ON "bot_assets" ("coin");

-- Create a unique constraint to ensure a bot can only track one record per coin
ALTER TABLE "bot_assets" 
  ADD CONSTRAINT "bot_assets_bot_id_coin_key" UNIQUE ("bot_id", "coin");

-- Update the model registry
INSERT INTO "sequelize_meta" ("name") 
VALUES ('20250701-add-bot-allocation-fields.sql')
ON CONFLICT DO NOTHING;
