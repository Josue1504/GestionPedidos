-- Migration 002: create user_permissions table (used for per-user permissions)

USE db_pedidos;

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id INT NOT NULL,
  permission_id INT NOT NULL,
  PRIMARY KEY (user_id, permission_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- Optional: index
CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id);
