-- =============================================================
-- OBSERVABILITY QUICK QUERIES (Postgres/Supabase)
-- =============================================================

-- 1) Alertas criticos abertos (ultimas 24h)
SELECT
  establishment_id,
  type,
  severity,
  count(*) AS total
FROM public.alerts
WHERE created_at >= now() - interval '24 hours'
  AND resolved = false
GROUP BY establishment_id, type, severity
ORDER BY total DESC;

-- 2) Taxa de resolucao de alertas (7 dias)
SELECT
  date_trunc('day', created_at) AS day,
  count(*) AS created,
  count(*) FILTER (WHERE resolved) AS resolved,
  round(
    100.0 * count(*) FILTER (WHERE resolved) / nullif(count(*), 0),
    2
  ) AS resolved_rate_pct
FROM public.alerts
WHERE created_at >= now() - interval '7 days'
GROUP BY 1
ORDER BY 1 DESC;

-- 3) Eventos de cash sem match (R05 backlog)
SELECT
  establishment_id,
  count(*) AS unmatched_cash_events
FROM public.cash_payment_events
WHERE matched = false
  AND detected_at >= now() - interval '24 hours'
GROUP BY establishment_id
ORDER BY unmatched_cash_events DESC;

-- 4) Integracoes com maior erro operacional recente (audit trail)
SELECT
  event_type,
  count(*) AS total
FROM public.audit_events
WHERE created_at >= now() - interval '24 hours'
  AND (
    event_type ILIKE '%error%'
    OR event_type ILIKE '%failed%'
  )
GROUP BY event_type
ORDER BY total DESC;
