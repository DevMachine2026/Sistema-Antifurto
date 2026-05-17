/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type TransactionSource = 'st_ingressos' | 'pagbank' | 'manual';
export type PaymentMethod = 'cash' | 'credit' | 'debit' | 'pix';

export interface Transaction {
  id: string;
  source: TransactionSource;
  amount: number;
  paymentMethod: PaymentMethod;
  occurredAt: string;
  importedAt: string;
  operatorId?: string;
  batchId: string;
}

export interface PeopleCountEvent {
  id: string;
  cameraId: string;
  countIn: number;
  countOut: number;
  peopleInside: number;
  recordedAt: string;
  /** Path no Storage ou URL legada — resolver com signEvidenceRef / SignedEvidenceImg */
  evidenceUrl?: string;
}

export type AlertType =
  | 'crowd_no_sales'
  | 'card_gap'
  | 'dead_window'
  | 'velocity_spike'
  | 'shift_missing_closing'
  | 'operator_void_abuse'
  | 'cash_ghost';

export type Severity = 'low' | 'medium' | 'high';

export interface Alert {
  id: string;
  type: AlertType;
  severity: Severity;
  description: string;
  context: any;
  resolved: boolean;
  resolvedBy?: string;
  createdAt: string;
}

export interface CashPaymentEvent {
  id: string;
  cameraId: string;
  detectedAt: string;
  windowMinutes: number;
  matched: boolean;
  createdAt: string;
}

export interface ImportBatch {
  id: string;
  source: TransactionSource;
  filename: string;
  rowsTotal: number;
  rowsImported: number;
  rowsFailed: number;
  status: 'processing' | 'done' | 'failed';
  importedBy: string;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  eventType: string;
  actor: string;
  targetType: string;
  targetId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export type CameraType   = 'people_counting' | 'cash_register';
export type CameraStatus = 'pending' | 'online' | 'offline';
export type CameraBrand  = 'intelbras' | 'hikvision' | 'dahua' | 'generic';

export type PosSyncStatus = 'matched' | 'no_cash_evidence' | 'card_ok' | 'orphan_cash';

export interface PosTimelineRow {
  rowType: 'transaction' | 'orphan_cash';
  transactionId?: string;
  occurredAt?: string;
  amount?: number;
  paymentMethod?: PaymentMethod;
  operatorId?: string;
  source?: TransactionSource;
  cashEventId?: string;
  cashDetectedAt?: string;
  cameraId?: string;
  evidenceUrl?: string;
  timeDiffSeconds?: number;
  syncStatus: PosSyncStatus;
}

export interface Camera {
  id: string;
  establishmentId: string;
  name: string;
  cameraId: string;
  ip?: string;
  port: number;
  brand: CameraBrand;
  cameraType: CameraType;
  status: CameraStatus;
  lastEventAt?: string;
  notes?: string;
  createdAt: string;
}
