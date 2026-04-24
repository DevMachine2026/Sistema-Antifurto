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
}

export type AlertType = 'crowd_no_sales' | 'card_gap' | 'dead_window' | 'velocity_spike' | 'shift_missing_closing';
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
