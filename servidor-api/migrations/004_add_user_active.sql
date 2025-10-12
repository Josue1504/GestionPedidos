-- Migration 004: add active flag to users for soft-delete
-- This migration is safe to run multiple times (uses IF NOT EXISTS pattern)

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS active TINYINT(1) DEFAULT 1;

-- Optional: mark existing inactive users explicitly if you have a criteria
-- UPDATE users SET active = 0 WHERE username IN ('banned_user');

-- Quick check:
-- SELECT id, username, active FROM users LIMIT 20;
