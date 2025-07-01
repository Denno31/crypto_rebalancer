-- First, drop the existing constraint that only allows one 3commas config across all users
ALTER TABLE "api_config" DROP CONSTRAINT IF EXISTS "api_config_name_key";

-- Then add the correct composite constraint that allows each user to have their own API configs
ALTER TABLE "api_config" ADD CONSTRAINT "api_config_name_user_id_key" UNIQUE ("name", "user_id");
