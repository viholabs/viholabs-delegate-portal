-- BixGrow integration: affiliate liquidations + extra fields on affiliate_accounts

-- Extra fields on affiliate_accounts for BixGrow data
ALTER TABLE affiliate_accounts
  ADD COLUMN IF NOT EXISTS commission_value  NUMERIC(10,4)   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS commission_type   TEXT            DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS referral_code     TEXT            DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS balance           NUMERIC(12,2)   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS paid_out          NUMERIC(12,2)   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS source            TEXT            DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_meta       JSONB           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS synced_at         TIMESTAMPTZ     DEFAULT NULL;

-- Liquidations: tracks commission payouts to affiliates
CREATE TABLE IF NOT EXISTS affiliate_liquidations (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_account_id UUID          NOT NULL REFERENCES affiliate_accounts(id) ON DELETE CASCADE,
  amount               NUMERIC(12,2) NOT NULL,
  currency             TEXT          NOT NULL DEFAULT 'EUR',
  period_from          DATE          NOT NULL,
  period_to            DATE          NOT NULL,
  state_code           TEXT          NOT NULL DEFAULT 'PENDING',
  notes                TEXT          DEFAULT NULL,
  paid_at              TIMESTAMPTZ   DEFAULT NULL,
  created_by           UUID          DEFAULT NULL,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_liquidations_account
  ON affiliate_liquidations(affiliate_account_id);

CREATE INDEX IF NOT EXISTS idx_affiliate_liquidations_state
  ON affiliate_liquidations(state_code);

-- Allow affiliate_attribution_events.email_norm to store customer email for matching
ALTER TABLE affiliate_attribution_events
  ADD COLUMN IF NOT EXISTS customer_email TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bixgrow_affiliate_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS order_amount NUMERIC(12,2) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_affiliate_events_bixgrow_affiliate
  ON affiliate_attribution_events(bixgrow_affiliate_id)
  WHERE bixgrow_affiliate_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_affiliate_events_customer_email
  ON affiliate_attribution_events(customer_email)
  WHERE customer_email IS NOT NULL;
