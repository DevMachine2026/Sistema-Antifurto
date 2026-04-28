import { supabase } from '../lib/supabase';
import { getCurrentEstablishmentId } from '../lib/tenant';
import { AuditEvent } from '../types';

interface AuditPayload {
  eventType: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  actor?: string;
}

class AuditService {
  async log(payload: AuditPayload): Promise<void> {
    const { error } = await supabase.from('audit_events').insert({
      establishment_id: getCurrentEstablishmentId(),
      event_type: payload.eventType,
      target_type: payload.targetType,
      target_id: payload.targetId ?? null,
      actor: payload.actor ?? 'ui_user',
      metadata: payload.metadata ?? {},
    });

    if (error) {
      console.warn('[audit] failed to persist event', payload.eventType, error.message);
    }
  }

  async getRecent(limit = 100): Promise<AuditEvent[]> {
    const { data, error } = await supabase
      .from('audit_events')
      .select('*')
      .eq('establishment_id', getCurrentEstablishmentId())
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return (data ?? []).map((row) => ({
      id: row.id,
      eventType: row.event_type,
      actor: row.actor,
      targetType: row.target_type,
      targetId: row.target_id ?? undefined,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
      createdAt: row.created_at,
    }));
  }
}

export const auditService = new AuditService();
