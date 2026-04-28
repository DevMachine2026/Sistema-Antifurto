-- =============================================================
-- MIGRATION: Idempotência de ingestão por chave externa
-- =============================================================

BEGIN;

ALTER TABLE public.people_count_events
  ADD COLUMN IF NOT EXISTS external_event_key text;

ALTER TABLE public.cash_payment_events
  ADD COLUMN IF NOT EXISTS external_event_key text;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS external_event_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_people_count_external_event
  ON public.people_count_events (establishment_id, external_event_key)
  WHERE external_event_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_payment_external_event
  ON public.cash_payment_events (establishment_id, external_event_key)
  WHERE external_event_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_external_event
  ON public.transactions (establishment_id, source, external_event_key)
  WHERE external_event_key IS NOT NULL;

COMMIT;
