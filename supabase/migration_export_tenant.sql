-- =============================================================
-- MIGRATION: Exportação LGPD — pacote de dados do estabelecimento
-- Aplicar após migration_rbac_multitenant.sql
-- Uso: supabase.rpc('export_establishment_data', { p_establishment_id: '...' })
-- =============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.export_establishment_data(p_establishment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  IF NOT (
    public.user_has_establishment_access(p_establishment_id)
    OR public.current_user_is_platform_admin()
  ) THEN
    RAISE EXCEPTION 'forbidden'
      USING HINT = 'Sem acesso a este estabelecimento.';
  END IF;

  SELECT jsonb_build_object(
    'exported_at', now(),
    'establishment_id', p_establishment_id,
    'establishment', (
      SELECT to_jsonb(e) - 'updated_at'
      FROM public.establishments e
      WHERE e.id = p_establishment_id
    ),
    'settings', (
      SELECT to_jsonb(s) - 'webhook_token'
      FROM public.settings s
      WHERE s.establishment_id = p_establishment_id
    ),
    'alerts', COALESCE((
      SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC)
      FROM (
        SELECT id, type, severity, description, context, resolved, resolved_by, created_at
        FROM public.alerts
        WHERE establishment_id = p_establishment_id
        ORDER BY created_at DESC
        LIMIT 500
      ) a
    ), '[]'::jsonb),
    'transactions', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.occurred_at DESC)
      FROM (
        SELECT id, source, amount, payment_method, operator_id, occurred_at, imported_at
        FROM public.transactions
        WHERE establishment_id = p_establishment_id
        ORDER BY occurred_at DESC
        LIMIT 500
      ) t
    ), '[]'::jsonb),
    'people_count_events', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.recorded_at DESC)
      FROM (
        SELECT id, camera_id, count_in, count_out, people_inside, recorded_at, evidence_storage_path
        FROM public.people_count_events
        WHERE establishment_id = p_establishment_id
        ORDER BY recorded_at DESC
        LIMIT 500
      ) p
    ), '[]'::jsonb),
    'cash_payment_events', COALESCE((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY c.detected_at DESC)
      FROM (
        SELECT id, camera_id, detected_at, window_minutes, matched, created_at, evidence_storage_path
        FROM public.cash_payment_events
        WHERE establishment_id = p_establishment_id
        ORDER BY detected_at DESC
        LIMIT 300
      ) c
    ), '[]'::jsonb),
    'audit_events', COALESCE((
      SELECT jsonb_agg(to_jsonb(ae) ORDER BY ae.created_at DESC)
      FROM (
        SELECT id, event_type, actor, target_type, target_id, metadata, created_at
        FROM public.audit_events
        WHERE establishment_id = p_establishment_id
        ORDER BY created_at DESC
        LIMIT 500
      ) ae
    ), '[]'::jsonb),
    'evidence_paths_note',
      'Arquivos JPEG no bucket evidence sob o prefixo do establishment_id. Baixe via painel ou solicite cópia ao suporte.'
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.export_establishment_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.export_establishment_data(uuid) TO authenticated;

COMMENT ON FUNCTION public.export_establishment_data IS
  'Exportação LGPD: JSON com dados do tenant (limites por tabela). Exclui webhook_token e credenciais de agente.';

COMMIT;
