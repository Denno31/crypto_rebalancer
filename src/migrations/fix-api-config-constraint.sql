-- Drop the existing constraint that prevents multiple users from having their own 3Commas configs
ALTER TABLE "api_config" DROP CONSTRAINT IF EXISTS "api_config_name_key";

-- Add the correct composite constraint that allows each user to have their own named API configs
ALTER TABLE "api_config" ADD CONSTRAINT "api_config_name_user_id_key" UNIQUE ("name", "user_id");
