import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckCircle2, AlertTriangle, XCircle, Camera, Clock,
  DollarSign, CreditCard, Banknote, Smartphone, RefreshCw,
  ChevronDown, ChevronUp, X, ZoomIn, Filter, Calendar,
  ArrowRight, Shield,
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { PosTimelineRow, PosSyncStatus } from '../types';

// ── helpers ────────────────────────────────────────────────────────────────

function isoRange(preset: string): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  const from = new Date(now);
  if (preset === 'today') {
    from.setHours(0, 0, 0, 0);
  } else if (preset === 'yesterday') {
    from.setDate(from.getDate() - 1);
    from.setHours(0, 0, 0, 0);
    const toYest = new Date(from);
    toYest.setHours(23, 59, 59, 999);
    return { from: from.toISOString(), to: toYest.toISOString() };
  } else if (preset === '7d') {
    from.setDate(from.getDate() - 7);
  } else if (preset === '30d') {
    from.setDate(from.getDate() - 30);
  }
  return { from: from.toISOString(), to };
}

function fmtTime(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function fmtAmount(v?: number) {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDelta(seconds?: number) {
  if (seconds == null) return null;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.round(seconds / 60)}min`;
}

// ── status config ──────────────────────────────────────────────────────────

const STATUS_CFG: Record<PosSyncStatus, {
  label: string; labelEn: string;
  bg: string; text: string; border: string; dot: string;
  icon: React.ReactNode;
}> = {
  matched: {
    label: 'Sincronizado', labelEn: 'Synced',
    bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', dot: 'bg-emerald-400',
    icon: <CheckCircle2 size={14} />,
  },
  no_cash_evidence: {
    label: 'Sem evidência', labelEn: 'No evidence',
    bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', dot: 'bg-amber-400',
    icon: <AlertTriangle size={14} />,
  },
  card_ok: {
    label: 'Cartão/PIX', labelEn: 'Card/PIX',
    bg: 'bg-zinc-500/10', text: 'text-zinc-400', border: 'border-zinc-500/20', dot: 'bg-zinc-500',
    icon: <CreditCard size={14} />,
  },
  orphan_cash: {
    label: 'Caixa sem venda', labelEn: 'Unregistered cash',
    bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20', dot: 'bg-red-500',
    icon: <XCircle size={14} />,
  },
};

function PaymentIcon({ method }: { method?: string }) {
  if (method === 'cash')   return <Banknote size={13} className="text-emerald-400" />;
  if (method === 'pix')    return <Smartphone size={13} className="text-violet-400" />;
  if (method === 'credit') return <CreditCard size={13} className="text-blue-400" />;
  if (method === 'debit')  return <CreditCard size={13} className="text-cyan-400" />;
  return <DollarSign size={13} className="text-zinc-400" />;
}

// ── thumbnail / lightbox ───────────────────────────────────────────────────

function Thumbnail({ url, alt, onClick }: { url?: string; alt: string; onClick: () => void }) {
  if (!url) {
    return (
      <div className="w-16 h-12 rounded bg-zinc-800 flex items-center justify-center flex-shrink-0">
        <Camera size={16} className="text-zinc-600" />
      </div>
    );
  }
  return (
    <button
      onClick={onClick}
      className="relative w-16 h-12 rounded overflow-hidden flex-shrink-0 group border border-zinc-700 hover:border-primary transition-colors"
    >
      <img src={url} alt={alt} className="w-full h-full object-cover" />
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <ZoomIn size={12} className="text-white" />
      </div>
    </button>
  );
}

function Lightbox({ row, onClose }: { row: PosTimelineRow; onClose: () => void }) {
  const cfg = STATUS_CFG[row.syncStatus];
  const ts = row.occurredAt ?? row.cashDetectedAt;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', damping: 20 }}
          className="bg-zinc-900 border border-zinc-700 rounded-xl max-w-2xl w-full overflow-hidden shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* image */}
          {row.evidenceUrl ? (
            <img src={row.evidenceUrl} alt="evidência" className="w-full max-h-96 object-contain bg-black" />
          ) : (
            <div className="w-full h-48 bg-zinc-800 flex flex-col items-center justify-center gap-2 text-zinc-500">
              <Camera size={32} />
              <span className="text-sm">Sem imagem de evidência</span>
            </div>
          )}

          {/* metadata */}
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                {cfg.icon} {cfg.label}
              </span>
              <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              {ts && (
                <div className="bg-zinc-800 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs mb-1">Data/Hora</p>
                  <p className="text-zinc-100 font-medium">{fmtDate(ts)} {fmtTime(ts)}</p>
                </div>
              )}
              {row.cameraId && (
                <div className="bg-zinc-800 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs mb-1">Câmera</p>
                  <p className="text-zinc-100 font-medium truncate">{row.cameraId}</p>
                </div>
              )}
              {row.amount != null && (
                <div className="bg-zinc-800 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs mb-1">Valor</p>
                  <p className="text-zinc-100 font-medium">{fmtAmount(row.amount)}</p>
                </div>
              )}
              {row.paymentMethod && (
                <div className="bg-zinc-800 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs mb-1">Método</p>
                  <p className="text-zinc-100 font-medium capitalize">{row.paymentMethod}</p>
                </div>
              )}
              {row.operatorId && (
                <div className="bg-zinc-800 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs mb-1">Operador</p>
                  <p className="text-zinc-100 font-medium truncate">{row.operatorId}</p>
                </div>
              )}
              {row.timeDiffSeconds != null && (
                <div className="bg-zinc-800 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs mb-1">Delta transação ↔ câmera</p>
                  <p className="text-zinc-100 font-medium">{fmtDelta(row.timeDiffSeconds)}</p>
                </div>
              )}
              {row.cashDetectedAt && row.occurredAt && (
                <div className="bg-zinc-800 rounded-lg p-3 col-span-2">
                  <p className="text-zinc-500 text-xs mb-2">Linha do tempo</p>
                  <div className="flex items-center gap-2 text-xs text-zinc-300">
                    <span className="bg-zinc-700 px-2 py-0.5 rounded">Câmera {fmtTime(row.cashDetectedAt)}</span>
                    <ArrowRight size={12} className="text-zinc-500" />
                    <span className="bg-zinc-700 px-2 py-0.5 rounded">Venda {fmtTime(row.occurredAt)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── row ────────────────────────────────────────────────────────────────────

function TimelineRow({ row, onExpand }: { row: PosTimelineRow; onExpand: () => void }) {
  const cfg = STATUS_CFG[row.syncStatus];
  const ts = row.occurredAt ?? row.cashDetectedAt;
  const isOrphan = row.syncStatus === 'orphan_cash';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors cursor-pointer hover:bg-zinc-800/60
        ${isOrphan ? 'border-red-500/30 bg-red-500/5' : 'border-zinc-700/50 bg-zinc-800/30'}`}
      onClick={onExpand}
    >
      {/* thumbnail */}
      <Thumbnail url={row.evidenceUrl} alt="evidência" onClick={onExpand} />

      {/* status dot */}
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />

      {/* time */}
      <div className="w-20 flex-shrink-0 text-right">
        <p className="text-xs text-zinc-300 font-mono">{fmtTime(ts)}</p>
        <p className="text-[10px] text-zinc-600">{fmtDate(ts)}</p>
      </div>

      {/* amount */}
      <div className="w-24 flex-shrink-0">
        <p className="text-sm font-semibold text-zinc-100">{fmtAmount(row.amount)}</p>
      </div>

      {/* method */}
      <div className="w-28 flex-shrink-0 flex items-center gap-1.5">
        <PaymentIcon method={row.paymentMethod} />
        <span className="text-xs text-zinc-400 capitalize">{row.paymentMethod ?? (isOrphan ? 'Espécie detectada' : '—')}</span>
      </div>

      {/* operator */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-zinc-500 truncate">{row.operatorId ?? row.cameraId ?? '—'}</p>
      </div>

      {/* delta */}
      {row.timeDiffSeconds != null && (
        <div className="w-14 flex-shrink-0 text-right">
          <span className="text-xs text-zinc-500 font-mono">{fmtDelta(row.timeDiffSeconds)}</span>
        </div>
      )}

      {/* badge */}
      <div className={`flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
        {cfg.icon}
        <span className="hidden sm:inline">{cfg.label}</span>
      </div>
    </motion.div>
  );
}

// ── stat card ──────────────────────────────────────────────────────────────

function StatCard({ value, label, sub, color, icon }: {
  value: number; label: string; sub?: string;
  color: 'green' | 'amber' | 'red' | 'zinc';
  icon: React.ReactNode;
}) {
  const colors = {
    green: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    red:   'text-red-400 bg-red-500/10 border-red-500/20',
    zinc:  'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
  };
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-4 ${colors[color]}`}>
      <div className="flex-shrink-0 opacity-80">{icon}</div>
      <div>
        <p className="text-2xl font-black">{value}</p>
        <p className="text-xs font-semibold opacity-80">{label}</p>
        {sub && <p className="text-[10px] opacity-60 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── main page ──────────────────────────────────────────────────────────────

const PRESETS = [
  { id: 'today',     label: 'Hoje' },
  { id: 'yesterday', label: 'Ontem' },
  { id: '7d',        label: '7 dias' },
  { id: '30d',       label: '30 dias' },
] as const;

const STATUS_FILTERS: { id: PosSyncStatus | 'all'; label: string }[] = [
  { id: 'all',             label: 'Todos' },
  { id: 'orphan_cash',     label: 'Caixa sem venda' },
  { id: 'no_cash_evidence',label: 'Sem evidência' },
  { id: 'matched',         label: 'Sincronizados' },
  { id: 'card_ok',         label: 'Cartão/PIX' },
];

export default function PosSync() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<PosTimelineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<string>('today');
  const [statusFilter, setStatusFilter] = useState<PosSyncStatus | 'all'>('all');
  const [lightboxRow, setLightboxRow] = useState<PosTimelineRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = isoRange(preset);
      const data = await dataService.getPosTimeline(from, to);
      setRows(data);
    } catch (e) {
      console.error('[PosSync] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [preset]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() =>
    statusFilter === 'all' ? rows : rows.filter(r => r.syncStatus === statusFilter),
    [rows, statusFilter]
  );

  const stats = useMemo(() => ({
    matched:         rows.filter(r => r.syncStatus === 'matched').length,
    no_cash_evidence:rows.filter(r => r.syncStatus === 'no_cash_evidence').length,
    orphan_cash:     rows.filter(r => r.syncStatus === 'orphan_cash').length,
    card_ok:         rows.filter(r => r.syncStatus === 'card_ok').length,
  }), [rows]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      {/* header */}
      <div>
        <h1 className="text-xl font-black text-zinc-100 flex items-center gap-2">
          <Shield size={20} className="text-primary" />
          POS × Vídeo
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Cada transação financeira cruzada com a câmera do caixa no momento exato.
        </p>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          value={stats.matched}
          label="Sincronizados"
          sub="transação + câmera"
          color="green"
          icon={<CheckCircle2 size={22} />}
        />
        <StatCard
          value={stats.no_cash_evidence}
          label="Sem evidência"
          sub="dinheiro sem câmera"
          color="amber"
          icon={<AlertTriangle size={22} />}
        />
        <StatCard
          value={stats.orphan_cash}
          label="Caixa sem venda"
          sub="risco máximo"
          color="red"
          icon={<XCircle size={22} />}
        />
        <StatCard
          value={stats.card_ok}
          label="Cartão/PIX"
          sub="sem câmera esperada"
          color="zinc"
          icon={<CreditCard size={22} />}
        />
      </div>

      {/* orphan alert banner */}
      {stats.orphan_cash > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3"
        >
          <XCircle size={18} className="text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300">
            <strong>{stats.orphan_cash}</strong> detecção{stats.orphan_cash > 1 ? 'ões' : ''} de espécie
            {stats.orphan_cash > 1 ? ' foram' : ' foi'} registrada{stats.orphan_cash > 1 ? 's' : ''}
            {' '}na câmera do caixa <strong>sem venda correspondente</strong> no sistema.
            Revise imediatamente.
          </p>
        </motion.div>
      )}

      {/* filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Calendar size={14} className="text-zinc-500" />
        {PRESETS.map(p => (
          <button
            key={p.id}
            onClick={() => setPreset(p.id)}
            className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors
              ${preset === p.id
                ? 'bg-primary/20 border-primary/40 text-primary'
                : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'}`}
          >
            {p.label}
          </button>
        ))}

        <div className="w-px h-4 bg-zinc-700 mx-1" />
        <Filter size={14} className="text-zinc-500" />
        {STATUS_FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setStatusFilter(f.id as any)}
            className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors
              ${statusFilter === f.id
                ? 'bg-primary/20 border-primary/40 text-primary'
                : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'}`}
          >
            {f.label}
          </button>
        ))}

        <button
          onClick={load}
          className="ml-auto flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* table header */}
      {filtered.length > 0 && (
        <div className="hidden sm:flex items-center gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
          <div className="w-16 flex-shrink-0">Câmera</div>
          <div className="w-2 flex-shrink-0" />
          <div className="w-20 flex-shrink-0 text-right">Hora</div>
          <div className="w-24 flex-shrink-0">Valor</div>
          <div className="w-28 flex-shrink-0">Método</div>
          <div className="flex-1">Operador / Câmera</div>
          <div className="w-14 text-right">Delta</div>
          <div className="w-28 text-right">Status</div>
        </div>
      )}

      {/* rows */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-zinc-500">
          <RefreshCw size={20} className="animate-spin mr-2" />
          Carregando timeline…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-600 gap-3">
          <Camera size={32} />
          <p className="text-sm">Nenhum evento encontrado para este período.</p>
          {rows.length > 0 && statusFilter !== 'all' && (
            <button onClick={() => setStatusFilter('all')} className="text-xs text-primary underline">
              Ver todos os {rows.length} eventos
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          <AnimatePresence mode="popLayout">
            {filtered.map((row, i) => (
              <TimelineRow
                key={row.transactionId ?? row.cashEventId ?? i}
                row={row}
                onExpand={() => setLightboxRow(row)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* summary */}
      {!loading && filtered.length > 0 && (
        <p className="text-xs text-zinc-600 text-center">
          {filtered.length} evento{filtered.length !== 1 ? 's' : ''} · clique em qualquer linha para ver a evidência
        </p>
      )}

      {/* lightbox */}
      {lightboxRow && (
        <Lightbox row={lightboxRow} onClose={() => setLightboxRow(null)} />
      )}
    </div>
  );
}
