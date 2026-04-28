import test from 'node:test';
import assert from 'node:assert/strict';

import {
  detectPaymentMethod,
  parseAmount,
  parseDateTime,
  parsePagBankCSV,
} from './pagbankParser';

test('detectPaymentMethod maps known variants', () => {
  assert.equal(detectPaymentMethod('Crédito Visa'), 'credit');
  assert.equal(detectPaymentMethod('Debito'), 'debit');
  assert.equal(detectPaymentMethod('PIX'), 'pix');
  assert.equal(detectPaymentMethod('Pagamento em espécie'), 'cash');
});

test('parseAmount handles BRL formatting and invalid values', () => {
  assert.equal(parseAmount('R$ 1.234,56'), 1234.56);
  assert.equal(parseAmount('99,90'), 99.9);
  assert.equal(parseAmount('valor-invalido'), 0);
});

test('parseDateTime parses dd/mm/yyyy and yyyy-mm-dd', () => {
  const br = parseDateTime('25/04/2026', '18:32:15');
  const iso = parseDateTime('2026-04-25', '18:32:15');

  assert.equal(new Date(br).toISOString().slice(0, 10), '2026-04-25');
  assert.equal(new Date(iso).toISOString().slice(0, 10), '2026-04-25');
});

test('parsePagBankCSV returns approved transactions only', async () => {
  const csv = [
    'Data;Hora;Tipo;Valor;Status',
    '25/04/2026;18:32:15;debito;85,98;Aprovada',
    '25/04/2026;19:15:42;credito;149,90;Recusada',
    '25/04/2026;20:08:33;pix;65,00;Concluída',
  ].join('\n');

  const file = new File([csv], 'pagbank.csv', { type: 'text/csv' });
  const result = await parsePagBankCSV(file);

  assert.equal(result.errors.length, 0);
  assert.equal(result.transactions.length, 2);
  assert.equal(result.transactions[0].paymentMethod, 'debit');
  assert.equal(result.transactions[1].paymentMethod, 'pix');
  assert.ok(Math.abs(result.totalAmount - 150.98) < 0.00001);
});

test('parsePagBankCSV reports empty/invalid csv', async () => {
  const file = new File([''], 'empty.csv', { type: 'text/csv' });
  const result = await parsePagBankCSV(file);

  assert.equal(result.transactions.length, 0);
  assert.equal(result.totalAmount, 0);
  assert.ok(result.errors.some((msg) => msg.includes('vazio') || msg.includes('inválido')));
});
