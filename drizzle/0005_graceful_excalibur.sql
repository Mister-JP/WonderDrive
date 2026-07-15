-- These profile columns already exist in the deployed database. They are part
-- of the initial identities table for clean installs, so this migration only
-- advances existing deployments past the previously unrecorded schema change.
SELECT 1;
