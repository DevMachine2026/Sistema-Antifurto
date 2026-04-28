import * as pdfjsLib from 'pdfjs-dist';
import { Transaction, PaymentMethod } from '../../types';
import { extractDate, parseBRL } from './stIngressosParserUtils';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export { extractDate, parseBRL } from './stIngressosParserUtils';

export interface ParseResult {
  transactions: Omit<Transaction, 'id' | 'batchId' | 'source' | 'importedAt'>[];
  filename: string;
  totalAmount: number;
  errors: string[];
}

export async function parseSTIngressosPDF(file: File): Promise<ParseResult> {
  const errors: string[] = [];
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map((item: any) => item.str).join(' ') + '\n';
  }

  const occurredAt = extractDate(fullText);

  const patterns: { method: PaymentMethod; regex: RegExp }[] = [
    { method: 'credit', regex: /Cart[aã]o de Cr[eé]dito\s+\d+\s+([\d.,]+)/i },
    { method: 'debit',  regex: /Cart[aã]o de D[eé]bito\s+\d+\s+([\d.,]+)/i },
    { method: 'pix',    regex: /PIX\s+\d+\s+([\d.,]+)/i },
    { method: 'cash',   regex: /Dinheiro\s+\d+\s+([\d.,]+)/i },
  ];

  const transactions: ParseResult['transactions'] = [];

  for (const { method, regex } of patterns) {
    const match = fullText.match(regex);
    if (match) {
      const amount = parseBRL(match[1]);
      if (amount > 0) {
        transactions.push({ amount, paymentMethod: method, occurredAt });
      }
    }
  }

  if (transactions.length === 0) {
    errors.push('Nenhuma transação encontrada. Verifique se o PDF é um relatório de fechamento do ST Ingressos.');
  }

  const totalAmount = transactions.reduce((s, t) => s + t.amount, 0);

  return { transactions, filename: file.name, totalAmount, errors };
}
