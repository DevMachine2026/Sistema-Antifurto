import { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Upload, FileText, CheckCircle2, Loader2, Download, AlertTriangle } from 'lucide-react';
import { dataService } from '../services/dataService';
import { Transaction, ImportBatch, TransactionSource } from '../types';
import { cn } from '../lib/utils';
import { parseSTIngressosPDF, ParseResult } from '../lib/parsers/stIngressosParser';
import { parsePagBankCSV, PAGBANK_CSV_TEMPLATE } from '../lib/parsers/pagbankParser';

const METHOD_LABEL: Record<string, string> = {
  credit: 'Crédito',
  debit:  'Débito',
  pix:    'PIX',
  cash:   'Dinheiro',
};

function downloadTemplate() {
  const blob = new Blob([PAGBANK_CSV_TEMPLATE], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'modelo_pagbank.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function UploadPage() {
  const [dragActive, setDragActive]   = useState(false);
  const [loading, setLoading]         = useState(false);
  const [importing, setImporting]     = useState(false);
  const [parseResult, setParseResult] = useState<(ParseResult & { source: TransactionSource }) | null>(null);
  const [batches, setBatches]         = useState<ImportBatch[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { dataService.getBatches().then(setBatches); }, []);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
  };

  const processFile = async (file: File) => {
    setLoading(true);
    setParseResult(null);
    try {
      const name = file.name.toLowerCase();
      const isSTIngressos = name.includes('ingresso') || name.endsWith('.pdf');
      const source: TransactionSource = isSTIngressos ? 'st_ingressos' : 'pagbank';

      const result = isSTIngressos
        ? await parseSTIngressosPDF(file)
        : await parsePagBankCSV(file);

      setParseResult({ ...result, source });
    } catch (err: any) {
      setParseResult({
        source: 'pagbank',
        transactions: [],
        filename: file.name,
        totalAmount: 0,
        errors: [`Erro ao processar arquivo: ${err.message}`],
      });
    } finally {
      setLoading(false);
    }
  };

  const confirmImport = async () => {
    if (!parseResult || parseResult.transactions.length === 0) return;
    setImporting(true);
    try {
      const batch: ImportBatch = {
        id: crypto.randomUUID(),
        source: parseResult.source,
        filename: parseResult.filename,
        rowsTotal:    parseResult.transactions.length,
        rowsImported: parseResult.transactions.length,
        rowsFailed:   parseResult.errors.length,
        status: 'done',
        importedBy: 'operador',
        createdAt: new Date().toISOString(),
      };
      const txs: Transaction[] = parseResult.transactions.map(t => ({
        id: crypto.randomUUID(),
        source: parseResult.source,
        amount: t.amount,
        paymentMethod: t.paymentMethod,
        occurredAt: t.occurredAt,
        importedAt: new Date().toISOString(),
        batchId: batch.id,
      }));
      await dataService.addTransactions(txs, batch);
      setBatches(await dataService.getBatches());
      setParseResult(null);
      alert('Importação concluída com sucesso!');
    } catch (err: any) {
      alert(`Erro na importação: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 flex-1 flex flex-col">
      <div className="bg-surface p-8 rounded-lg border border-border shadow-sm">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h2 className="text-xl font-bold text-text uppercase tracking-tight">Central de Ingestão</h2>
            <p className="text-text-dim text-sm mt-1 font-medium">
              Arraste o relatório do ST Ingressos (.pdf) ou extrato do PagBank (.csv).
            </p>
          </div>
          <button
            onClick={downloadTemplate}
            className="shrink-0 flex items-center gap-2 px-3 py-2 bg-surface-alt border border-border rounded text-[10px] uppercase font-black tracking-widest text-text-dim hover:text-text transition-colors"
          >
            <Download size={12} /> Modelo PagBank
          </button>
        </div>

        {!parseResult ? (
          <div
            onDragEnter={handleDrag} onDragOver={handleDrag}
            onDragLeave={handleDrag} onDrop={handleDrop}
            className={cn(
              "mt-6 border border-dashed rounded-lg p-12 flex flex-col items-center gap-4 transition-all duration-300",
              dragActive ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/50 hover:bg-surface-alt/50"
            )}
          >
            <div className="w-16 h-16 bg-surface-alt text-primary rounded-lg flex items-center justify-center shadow-inner">
              {loading ? <Loader2 size={32} className="animate-spin" /> : <Upload size={32} />}
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-text uppercase tracking-wider">
                {loading ? 'Processando arquivo...' : 'Solte o arquivo aqui'}
              </p>
              <p className="text-[11px] text-text-dim mt-1 uppercase tracking-tight">
                ST Ingressos (.pdf) · PagBank (.csv) — detecção automática
              </p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 px-6 py-2.5 bg-primary text-white rounded font-bold text-[12px] uppercase tracking-widest hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
            >
              Procurar Arquivo
            </button>
            <input
              type="file" ref={fileInputRef} className="hidden"
              onChange={e => e.target.files?.[0] && processFile(e.target.files[0])}
              accept=".csv,.pdf"
            />
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 mt-6">
            {/* Header */}
            <div className="flex items-center justify-between p-4 bg-surface-alt rounded border border-border">
              <div className="flex items-center gap-3">
                <FileText className="text-primary shrink-0" />
                <div>
                  <p className="text-xs font-bold text-text uppercase tracking-widest">
                    {parseResult.source === 'st_ingressos' ? 'ST Ingressos — Bilheteria' : 'PagBank — Financeiro'}
                  </p>
                  <p className="text-[11px] text-text-dim font-mono">{parseResult.filename}</p>
                </div>
              </div>
              <button
                onClick={() => setParseResult(null)}
                className="text-[10px] uppercase font-bold text-text-dim hover:text-text tracking-widest"
              >
                [ Cancelar ]
              </button>
            </div>

            {/* Erros de parse */}
            {parseResult.errors.length > 0 && (
              <div className="flex flex-col gap-1.5 p-4 bg-danger/5 border border-danger/30 rounded">
                {parseResult.errors.map((e, i) => (
                  <div key={i} className="flex items-start gap-2 text-[11px] text-danger font-mono">
                    <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                    {e}
                  </div>
                ))}
              </div>
            )}

            {/* Tabela */}
            {parseResult.transactions.length > 0 && (
              <div className="border border-border rounded overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-surface-alt text-text-dim font-bold uppercase text-[10px] tracking-wider border-b border-border">
                    <tr>
                      <th className="px-5 py-4">Valor</th>
                      <th className="px-5 py-4">Método</th>
                      <th className="px-5 py-4">Data/Hora</th>
                      <th className="px-5 py-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {parseResult.transactions.map((row, i) => (
                      <tr key={i} className="hover:bg-surface-alt/50 transition-colors">
                        <td className="px-5 py-4 font-bold text-text font-mono">R$ {row.amount.toFixed(2)}</td>
                        <td className="px-5 py-4 text-text-dim uppercase text-[10px] font-bold">
                          {METHOD_LABEL[row.paymentMethod] ?? row.paymentMethod}
                        </td>
                        <td className="px-5 py-4 text-text-dim font-mono text-[10px]">
                          {new Date(row.occurredAt).toLocaleString('pt-BR')}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <span className="text-success text-[10px] font-black uppercase tracking-widest">OK</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-border bg-surface-alt">
                    <tr>
                      <td className="px-5 py-3 font-black text-text font-mono">
                        R$ {parseResult.totalAmount.toFixed(2)}
                      </td>
                      <td colSpan={3} className="px-5 py-3 text-[10px] text-text-dim uppercase font-bold tracking-widest">
                        Total · {parseResult.transactions.length} registro(s)
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <button
              onClick={confirmImport}
              disabled={importing || parseResult.transactions.length === 0}
              className="w-full bg-surface border border-border text-primary font-black py-4 rounded uppercase text-[12px] tracking-[0.2em] hover:bg-surface-alt transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
            >
              {importing
                ? <><Loader2 size={18} className="animate-spin" /> Salvando...</>
                : <><CheckCircle2 size={18} /> Confirmar Importação</>
              }
            </button>
          </motion.div>
        )}
      </div>

      {/* Log de importações */}
      <div className="bg-surface rounded-lg border border-border shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="p-5 border-b border-border">
          <h3 className="text-[13px] uppercase font-bold tracking-widest text-text">Registro de Auditoria (Logs)</h3>
        </div>
        <div className="divide-y divide-border overflow-auto">
          {batches.length === 0 ? (
            <div className="p-10 text-center text-text-dim text-xs font-mono">Nenhuma importação registrada.</div>
          ) : (
            batches.map(batch => (
              <div key={batch.id} className="p-4 flex items-center justify-between hover:bg-surface-alt/50 transition-colors group">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-surface-alt border border-border rounded flex items-center justify-center text-text-dim group-hover:text-primary transition-colors">
                    <Download size={16} />
                  </div>
                  <div>
                    <p className="text-[12px] font-mono text-text">{batch.filename}</p>
                    <p className="text-[10px] text-text-dim uppercase tracking-tighter font-medium">
                      {new Date(batch.createdAt).toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-mono font-bold text-text">{batch.rowsImported} registros</span>
                  <p className="text-[9px] text-success font-black uppercase tracking-widest mt-0.5">Importado</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
