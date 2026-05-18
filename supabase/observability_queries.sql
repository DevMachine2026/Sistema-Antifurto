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

-- 5) Volume de eventos por dia (últimos 7 dias) — tendência de custo DB
SELECT
  date_trunc('day', recorded_at) AS day,
  count(*) AS people_events
FROM public.people_count_events
WHERE recorded_at >= now() - interval '7 days'
GROUP BY 1
ORDER BY 1 DESC;

-- 6) Agentes sem heartbeat recente (> 15 min)
SELECT
  ac.name,
  ac.establishment_id,
  ah.reported_at,
  ah.cameras_online,
  ah.version
FROM public.agent_configs ac
LEFT JOIN public.agent_heartbeats ah ON ah.agent_id = ac.id
WHERE ac.active = true
  AND (ah.reported_at IS NULL OR ah.reported_at < now() - interval '15 minutes')
ORDER BY ah.reported_at NULLS FIRST;
