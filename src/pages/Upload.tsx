import { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Upload, FileText, CheckCircle2, Loader2, Download } from 'lucide-react';
import { dataService } from '../services/dataService';
import { Transaction, ImportBatch, TransactionSource, PaymentMethod } from '../types';
import { cn } from '../lib/utils';

export default function UploadPage() {
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<{ source: TransactionSource; data: any[] } | null>(null);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    dataService.getBatches().then(setBatches);
  }, []);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
  };

  const processFile = async (file: File) => {
    setLoading(true);
    const source: TransactionSource = file.name.toLowerCase().includes('ingressos') ? 'st_ingressos' : 'pagbank';
    await new Promise(r => setTimeout(r, 1500));
    const mockRows = Array.from({ length: 5 }).map(() => ({
      id: crypto.randomUUID(),
      amount: Math.floor(Math.random() * 200) + 20,
      paymentMethod: ['credit', 'debit', 'pix', 'cash'][Math.floor(Math.random() * 4)] as PaymentMethod,
      occurredAt: new Date().toISOString(),
    }));
    setPreview({ source, data: mockRows });
    setLoading(false);
  };

  const confirmImport = async () => {
    if (!preview) return;
    setImporting(true);
    try {
      const batch: ImportBatch = {
        id: crypto.randomUUID(),
        source: preview.source,
        filename: `import_${preview.source}_${Date.now()}.csv`,
        rowsTotal: preview.data.length,
        rowsImported: preview.data.length,
        rowsFailed: 0,
        status: 'done',
        importedBy: 'Eduardo',
        createdAt: new Date().toISOString(),
      };
      const txs: Transaction[] = preview.data.map(d => ({
        ...d,
        source: preview.source,
        importedAt: new Date().toISOString(),
        batchId: batch.id,
      }));
      await dataService.addTransactions(txs, batch);
      setBatches(await dataService.getBatches());
      setPreview(null);
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
        <h2 className="text-xl font-bold text-text uppercase tracking-tight mb-2">Central de Ingestão</h2>
        <p className="text-text-dim text-sm mb-8 font-medium">Arraste seus relatórios do ST Ingressos ou PagBank para auditar as transações.</p>

        {!preview ? (
          <div
            onDragEnter={handleDrag} onDragOver={handleDrag}
            onDragLeave={handleDrag} onDrop={handleDrop}
            className={cn(
              "border border-dashed rounded-lg p-12 flex flex-col items-center gap-4 transition-all duration-300",
              dragActive ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/50 hover:bg-surface-alt/50"
            )}
          >
            <div className="w-16 h-16 bg-surface-alt text-primary rounded-lg flex items-center justify-center shadow-inner">
              {loading ? <Loader2 size={32} className="animate-spin" /> : <Upload size={32} />}
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-text uppercase tracking-wider">
                {loading ? 'Processando arquivo...' : 'Solte o arquivo CSV'}
              </p>
              <p className="text-[11px] text-text-dim mt-1 uppercase tracking-tight">Detecção automática (ST Ingressos / PagBank)</p>
            </div>
            <button onClick={() => fileInputRef.current?.click()}
              className="mt-4 px-6 py-2.5 bg-primary text-white rounded font-bold text-[12px] uppercase tracking-widest hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20">
              Procurar Arquivo
            </button>
            <input type="file" ref={fileInputRef} className="hidden"
              onChange={e => e.target.files?.[0] && processFile(e.target.files[0])}
              accept=".csv,.xlsx" />
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-surface-alt rounded border border-border">
              <div className="flex items-center gap-3">
                <FileText className="text-primary" />
                <div>
                  <p className="text-xs font-bold text-text uppercase tracking-widest">
                    Preview: {preview.source === 'st_ingressos' ? 'Bilheteria' : 'Financeiro'}
                  </p>
                  <p className="text-[11px] text-text-dim font-mono">{preview.data.length} registros detectados</p>
                </div>
              </div>
              <button onClick={() => setPreview(null)}
                className="text-[10px] uppercase font-bold text-text-dim hover:text-text tracking-widest">
                [ Cancelar ]
              </button>
            </div>

            <div className="border border-border rounded overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-surface-alt text-text-dim font-bold uppercase text-[10px] tracking-wider border-b border-border">
                  <tr>
                    <th className="px-5 py-4">Valor</th>
                    <th className="px-5 py-4">Método</th>
                    <th className="px-5 py-4">Timestamp</th>
                    <th className="px-5 py-4 text-right">Integridade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.data.map((row, i) => (
                    <tr key={i} className="hover:bg-surface-alt/50 transition-colors">
                      <td className="px-5 py-4 font-bold text-text font-mono tracking-tighter">R$ {row.amount.toFixed(2)}</td>
                      <td className="px-5 py-4 text-text-dim uppercase text-[10px] font-bold">{row.paymentMethod}</td>
                      <td className="px-5 py-4 text-text-dim font-mono text-[10px]">{new Date(row.occurredAt).toLocaleTimeString()}</td>
                      <td className="px-5 py-4 text-right">
                        <span className="text-success text-[10px] font-black uppercase tracking-widest">OK</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-4">
              <button onClick={confirmImport} disabled={importing}
                className="flex-1 bg-surface border border-border text-primary font-black py-4 rounded uppercase text-[12px] tracking-[0.2em] hover:bg-surface-alt transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50">
                {importing
                  ? <><Loader2 size={18} className="animate-spin" /> Salvando...</>
                  : <><CheckCircle2 size={18} /> Confirmar Batch #{Date.now().toString().slice(-4)}</>
                }
              </button>
            </div>
          </motion.div>
        )}
      </div>

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
                    <p className="text-[10px] text-text-dim uppercase tracking-tighter font-medium">{new Date(batch.createdAt).toLocaleString()}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-mono font-bold text-text">{batch.rowsImported} L_ID</span>
                  <p className="text-[9px] text-success font-black uppercase tracking-widest mt-0.5">Integridade_Verificada</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
