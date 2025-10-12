-- Migration 003: add created_by to pedidos (nullable)

USE db_pedidos;

-- Add column created_by to track which user created the pedido. It's nullable
-- so existing rows remain untouched. New pedidos will set this column when
-- inserting (server code already attempts to set it).
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS created_by INT NULL,
  ADD INDEX idx_pedidos_created_by (created_by);

-- Optional foreign key (uncomment if you want referential integrity and your
-- users table uses the same engine and constraints):
-- ALTER TABLE pedidos
--   ADD CONSTRAINT fk_pedidos_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- OPTIONAL: populate created_by from vendedor when username matches exactly
-- (run only if you are confident the 'vendedor' column contains usernames and
-- you want to associate historic pedidos to users):
-- UPDATE pedidos p
-- JOIN users u ON u.username = p.vendedor
-- SET p.created_by = u.id
-- WHERE p.created_by IS NULL;

-- Notes:
-- - This migration intentionally does NOT populate existing rows by default.
--   That prevents accidentally assigning old pedidos to newly created users.
-- - After running it, new pedidos created from the app will set created_by and
--   the 'GET /api/pedidos' route will correctly return only the user's own
--   pedidos for users without 'pedidos.view_all'.
