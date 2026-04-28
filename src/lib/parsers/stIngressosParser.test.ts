import test from 'node:test';
import assert from 'node:assert/strict';

import { parseBRL, extractDate } from './stIngressosParserUtils';

test('parseBRL converts brazilian currency strings', () => {
  assert.equal(parseBRL('1.234,56'), 1234.56);
  assert.equal(parseBRL('85,98'), 85.98);
});

test('extractDate returns ISO date from dd/mm/yyyy text', () => {
  const iso = extractDate('Relatorio de fechamento - Data: 25/04/2026');
  assert.equal(new Date(iso).toISOString().slice(0, 10), '2026-04-25');
});
