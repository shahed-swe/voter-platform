-- Revert 016: restore NOT NULL on users.email.
-- Note: will fail if any rows have NULL email; backfill before rolling back.
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
