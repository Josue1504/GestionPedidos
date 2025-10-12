-- Migration 005: add 'estado' flag to users for soft/legacy state
-- Adds an 'estado' column (TINYINT) used by some parts of the app.
-- Safe to run multiple times thanks to IF NOT EXISTS pattern.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS estado TINYINT(1) DEFAULT 1;

-- Ensure existing rows are populated (optional)
UPDATE users SET estado = 1 WHERE estado IS NULL;

-- Quick sanity check:
-- SELECT id, username, COALESCE(estado, 1) AS estado FROM users LIMIT 20;

-- If you prefer to keep 'active' as canonical, you can run this to keep both in sync:
-- UPDATE users SET estado = COALESCE(active, 1) WHERE estado IS NULL;
