import {
  Transaction,
  PeopleCountEvent,
  Alert,
  AlertType,
  Severity,
  ImportBatch,
  CashPaymentEvent,
  PosTimelineRow,
} from '../types';
import { supabase } from '../lib/supabase';
import { getCurrentEstablishmentId } from '../lib/tenant';
import { evidenceRef } from '../lib/evidenceUrl';
import { notificationService } from './notificationService';

class DataService {
  private get establishmentId(): string {
    return getCurrentEstablishmentId();
  }

  // ── Leitura ────────────────────────────────────────────────

  async getTransactions(): Promise<Transaction[]> {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('establishment_id', this.establishmentId)
      .order('occurred_at', { ascending: false });

    if (error) throw error;

    return (data ?? []).map(row => ({
      id: row.id,
      source: row.source,
      amount: Number(row.amount),
      paymentMethod: row.payment_method,
      occurredAt: row.occurred_at,
      importedAt: row.imported_at,
      operatorId: row.operator_id ?? undefined,
      batchId: row.batch_id,
    }));
  }

  async getPeopleCount(): Promise<PeopleCountEvent[]> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('people_count_events')
      .select('*')
      .eq('establishment_id', this.establishmentId)
      .gte('recorded_at', since)
      .order('recorded_at', { ascending: true });

    if (error) throw error;

    return (data ?? []).map(row => ({
      id: row.id,
      cameraId: row.camera_id,
      countIn: row.count_in,
      countOut: row.count_out,
      peopleInside: row.people_inside,
      recordedAt: row.recorded_at,
      evidenceUrl: evidenceRef(
        row.evidence_storage_path as string | null,
        row.evidence_url as string | null,
      ) ?? undefined,
    }));
  }

  async getAlerts(): Promise<Alert[]> {
    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .eq('establishment_id', this.establishmentId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data ?? []).map(row => ({
      id: row.id,
      type: row.type,
      severity: row.severity,
      description: row.description,
      context: row.context,
      resolved: row.resolved,
      resolvedBy: row.resolved_by ?? undefined,
      createdAt: row.created_at,
    }));
  }

  async getBatches(): Promise<ImportBatch[]> {
    const { data, error } = await supabase
      .from('import_batches')
      .select('*')
      .eq('establishment_id', this.establishmentId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data ?? []).map(row => ({
      id: row.id,
      source: row.source,
      filename: row.filename,
      rowsTotal: row.rows_total,
      rowsImported: row.rows_imported,
      rowsFailed: row.rows_failed,
      status: row.status,
      importedBy: row.imported_by,
      createdAt: row.created_at,
    }));
  }

  // ── Escrita ────────────────────────────────────────────────

  async addTransactions(newTransactions: Transaction[], batch: ImportBatch): Promise<void> {
    // 1. Insere o lote
    const { data: batchData, error: batchError } = await supabase
      .from('import_batches')
      .insert({
        id: batch.id,
        establishment_id: this.establishmentId,
        source: batch.source,
        filename: batch.filename,
        rows_total: batch.rowsTotal,
        rows_imported: batch.rowsImported,
        rows_failed: batch.rowsFailed,
        status: batch.status,
        imported_by: batch.importedBy,
      })
      .select()
      .single();

    if (batchError) throw batchError;

    // 2. Insere as transações
    const rows = newTransactions.map(t => ({
      id: t.id,
      establishment_id: this.establishmentId,
      batch_id: batchData.id,
      source: t.source,
      amount: t.amount,
      payment_method: t.paymentMethod,
      operator_id: t.operatorId ?? null,
      occurred_at: t.occurredAt,
      imported_at: t.importedAt,
    }));

    const { error: txError } = await supabase.from('transactions').insert(rows);
    if (txError) throw txError;

    // 3. Roda o motor de regras no banco
    await this.runRules();
  }

  async getCashPaymentEvents(): Promise<CashPaymentEvent[]> {
    const { data, error } = await supabase
      .from('cash_payment_events')
      .select('*')
      .eq('establishment_id', this.establishmentId)
      .order('detected_at', { ascending: false });

    if (error) throw error;

    return (data ?? []).map(row => ({
      id: row.id,
      cameraId: row.camera_id,
      detectedAt: row.detected_at,
      windowMinutes: row.window_minutes,
      matched: row.matched,
      createdAt: row.created_at,
    }));
  }

  async addCashPaymentEvent(event: Omit<CashPaymentEvent, 'id' | 'matched' | 'createdAt'>): Promise<void> {
    const { error } = await supabase.from('cash_payment_events').insert({
      establishment_id: this.establishmentId,
      camera_id: event.cameraId,
      detected_at: event.detectedAt,
      window_minutes: event.windowMinutes,
    });

    if (error) throw error;

    await this.runRules();
  }

  async addPeopleCount(event: PeopleCountEvent): Promise<void> {
    const { error } = await supabase.from('people_count_events').insert({
      id: event.id,
      establishment_id: this.establishmentId,
      camera_id: event.cameraId,
      count_in: event.countIn,
      count_out: event.countOut,
      people_inside: event.peopleInside,
      recorded_at: event.recordedAt,
    });

    if (error) throw error;

    await this.runRules();
  }

  async getPosTimeline(from: string, to: string): Promise<PosTimelineRow[]> {
    const { data, error } = await supabase.rpc('get_pos_timeline', {
      p_establishment_id: this.establishmentId,
      p_from: from,
      p_to: to,
    });

    if (error) throw error;

    return (data ?? []).map((row: any) => ({
      rowType: row.row_type,
      transactionId: row.transaction_id ?? undefined,
      occurredAt: row.occurred_at ?? undefined,
      amount: row.amount != null ? Number(row.amount) : undefined,
      paymentMethod: row.payment_method ?? undefined,
      operatorId: row.operator_id ?? undefined,
      source: row.source ?? undefined,
      cashEventId: row.cash_event_id ?? undefined,
      cashDetectedAt: row.cash_detected_at ?? undefined,
      cameraId: row.camera_id ?? undefined,
      evidenceUrl: evidenceRef(row.evidence_storage_path, row.evidence_url) ?? undefined,
      timeDiffSeconds: row.time_diff_seconds ?? undefined,
      syncStatus: row.sync_status,
    }));
  }

  async resolveAlert(alertId: string, user: string): Promise<void> {
    const { error } = await supabase.rpc('resolve_alert', {
      p_alert_id: alertId,
      p_resolved_by: user,
    });

    if (error) throw error;
  }

  // ── Motor de Regras ────────────────────────────────────────

  private async runRules(): Promise<void> {
    const { data, error } = await supabase.rpc('run_fraud_rules', {
      p_establishment_id: this.establishmentId,
    });

    if (error) {
      console.error('[runRules] Erro ao executar regras:', error.message);
      return;
    }

    if (!data?.length) return;

    const allowedSeverity = (s: string): Severity =>
      s === 'low' || s === 'medium' || s === 'high' ? s : 'medium';

    for (const row of data) {
      const alert: Alert = {
        id: crypto.randomUUID(),
        type: row.alert_type as AlertType,
        severity: allowedSeverity(String(row.severity ?? 'medium')),
        description: row.description,
        context: {},
        resolved: false,
        createdAt: new Date().toISOString(),
      };
      await notificationService.sendAlert(alert);
    }
  }
}

export const dataService = new DataService();
