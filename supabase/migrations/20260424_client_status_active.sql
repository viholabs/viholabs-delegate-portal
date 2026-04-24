-- Set all existing clients to ACTIVE status
-- Clients were previously created with PENDING_VALIDATION or NULL status.
-- The canonical default going forward is ACTIVE.
UPDATE clients
SET status = 'ACTIVE', updated_at = now()
WHERE status IS NULL OR status = 'PENDING_VALIDATION';
