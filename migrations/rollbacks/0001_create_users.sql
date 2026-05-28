-- Rollback: 0001_create_users
-- Drops the users table and its indexes

DROP INDEX IF EXISTS idx_users_email;
DROP TABLE IF EXISTS users;
