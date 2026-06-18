ALTER TABLE "User" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'user';

-- Ensure Andrea account is admin by both role and type
UPDATE "User"
SET "role" = 'admin',
    "type" = 'admin'
WHERE LOWER("email") = 'andreacazzola90@gmail.com'
   OR LOWER(SPLIT_PART("email", '@', 1)) = 'andreacazzola90';
