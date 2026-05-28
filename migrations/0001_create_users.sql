-- Migration: 0001_create_users
-- Creates the initial users table

CREATE TABLE IF NOT EXISTS users (
  id        TEXT      PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email     TEXT      NOT NULL UNIQUE,
  name      TEXT      NOT NULL,
  role      TEXT      NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
