import Papa from 'papaparse';
import { PaymentMethod } from '../../types';
import { ParseResult } from './stIngressosParser';

export function detectPaymentMethod(value: string): PaymentMethod {
  const v = value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (v.includes('credito') || v.includes('credit'))  return 'credit';
  if (v.includes('debito')  || v.includes('debit'))   return 'debit';
  if (v.includes('pix'))                               return 'pix';
  if (v.includes('dinheiro') || v.includes('cash') || v.includes('especie')) return 'cash';
  return 'credit';
}

export function parseAmount(value: string): number {
  const v = value.replace(/[R$\s]/g, '');
  let normalized: string;
  if (v.includes(',') && v.includes('.')) {
    // Formato BR: 1.234,56 → remover pontos, trocar vírgula por ponto
    normalized = v.replace(/\./g, '').replace(',', '.');
  } else if (v.includes(',') && !v.includes('.')) {
    // Só vírgula: pode ser decimal BR (120,50) ou milhar (1,234)
    const parts = v.split(',');
    normalized = parts.length === 2 && parts[1].length <= 2
      ? v.replace(',', '.')   // decimal
      : v.replace(',', '');   // milhar sem decimal
  } else {
    // Só ponto ou nenhum separador: formato americano ou inteiro
    normalized = v;
  }
  const n = parseFloat(normalized);
  return isNaN(n) ? 0 : n;
}

export function parseDateTime(date: string, time = '12:00:00'): string {
  const parts = date.trim().split(/[\/\-]/);
  if (parts.length === 3) {
    let iso: string;
    // dd/mm/yyyy ou yyyy-mm-dd
    if (parts[0].length === 4) {
      iso = `${parts[0]}-${parts[1]}-${parts[2]}T${time}`;
    } else {
      iso = `${parts[2]}-${parts[1]}-${parts[0]}T${time}`;
    }
    const d = new Date(iso);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }
  return new Date().toISOString();
}

export async function parsePagBankCSV(file: File): Promise<ParseResult> {
  const text = await file.text();
  const errors: string[] = [];

  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    delimiter: '', // auto-detect , or ;
  });

  if (result.errors.length) {
    errors.push(...result.errors.slice(0, 3).map(e => e.message));
  }

  const rows = result.data as Record<string, string>[];
  if (rows.length === 0) {
    errors.push('Arquivo CSV vazio ou formato inválido.');
    return { transactions: [], filename: file.name, totalAmount: 0, errors };
  }



  const col = (row: Record<string, string>, ...candidates: string[]) => {
    for (const c of candidates) {
      const key = Object.keys(row).find(k => k.toLowerCase().trim().includes(c));
      if (key && row[key]) return row[key].trim();
    }
    return '';
  };

  const transactions: ParseResult['transactions'] = [];

  for (const row of rows) {
    const status = col(row, 'status').toLowerCase();
    if (status && !status.includes('aprovad') && !status.includes('paid') && !status.includes('conclu')) {
      continue; // ignora canceladas/recusadas
    }

    const amountRaw = col(row, 'valor bruto', 'valor', 'amount', 'total');
    const amount = parseAmount(amountRaw);
    if (amount <= 0) continue;

    const typeRaw = col(row, 'tipo', 'meio', 'modalidade', 'forma', 'payment', 'bandeira');
    const paymentMethod = detectPaymentMethod(typeRaw);

    const dateRaw = col(row, 'data', 'date');
    const timeRaw = col(row, 'hora', 'time');
    const occurredAt = parseDateTime(dateRaw, timeRaw || '12:00:00');

    transactions.push({ amount, paymentMethod, occurredAt });
  }

  if (transactions.length === 0) {
    errors.push('Nenhuma transação aprovada encontrada. Verifique o formato do arquivo.');
  }

  const totalAmount = transactions.reduce((s, t) => s + t.amount, 0);
  return { transactions, filename: file.name, totalAmount, errors };
}

// Template CSV para download
export const PAGBANK_CSV_TEMPLATE =
  'Data,Hora,Tipo,Valor,Status\n' +
  '25/04/2026,18:32:15,debito,85.98,Aprovada\n' +
  '25/04/2026,19:15:42,credito,149.90,Aprovada\n' +
  '25/04/2026,20:08:33,pix,65.00,Aprovada\n' +
  '25/04/2026,21:44:10,credito,220.00,Aprovada\n';
