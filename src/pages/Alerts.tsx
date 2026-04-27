import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, CheckCircle2, ShieldAlert, History, MapPin, Clock, MessageCircle } from 'lucide-react';
import { dataService } from '../services/dataService';
import { notificationService } from '../services/notificationService';
import { format, parseISO } from 'date-fns';
import { cn } from '../lib/utils';
import { Alert } from '../types';

export default function AlertsPage() {
  const [filter, setFilter] = useState<'all' | 'unresolved' | 'resolved'>('unresolved');
  const [allAlerts, setAllAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadAlerts() {
    try {
      const data = await dataService.getAlerts();
      setAllAlerts(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAlerts(); }, []);

  const filteredAlerts = allAlerts.filter(a => {
    if (filter === 'all') return true;
    if (filter === 'resolved') return a.resolved;
    return !a.resolved;
  });

  const handleResolve = async (id: string) => {
    await dataService.resolveAlert(id, 'Eduardo (Proprietário)');
    await loadAlerts();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="text-text-dim text-xs font-mono uppercase tracking-widest animate-pulse">Carregando alertas...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-text uppercase tracking-tight">Audit Center</h2>
          <p className="text-text-dim text-sm font-medium">Regras de anomalia executadas pelo motor de IA local.</p>
        </div>
        <div className="flex bg-surface p-1 rounded border border-border shadow-sm self-start">
          <FilterBtn active={filter === 'unresolved'} onClick={() => setFilter('unresolved')} label="Ativos" count={allAlerts.filter(a => !a.resolved).length} />
          <FilterBtn active={filter === 'resolved'} onClick={() => setFilter('resolved')} label="Resolvidos" count={allAlerts.filter(a => a.resolved).length} />
          <FilterBtn active={filter === 'all'} onClick={() => setFilter('all')} label="Todos" count={allAlerts.length} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <AnimatePresence mode="popLayout">
          {filteredAlerts.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="bg-surface rounded-lg p-12 border border-border text-center space-y-4">
              <div className="w-12 h-12 bg-success/10 text-success rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 size={24} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-text uppercase">Operação Segura</h4>
                <p className="text-text-dim text-xs mt-1">Nenhum desvio detectado para os filtros aplicados.</p>
              </div>
            </motion.div>
          ) : (
            filteredAlerts.map(alert => (
              <AlertCard key={alert.id} alert={alert} onResolve={handleResolve} />
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function FilterBtn({ active, onClick, label, count }: any) {
  return (
    <button onClick={onClick} className={cn(
      "px-4 py-2 rounded text-[11px] font-bold uppercase tracking-wider transition-all flex items-center gap-2",
      active ? "bg-surface-alt text-white shadow-sm border border-border" : "text-text-dim hover:text-text"
    )}>
      {label}
      <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-black", active ? "bg-primary text-white" : "bg-surface-alt text-text-dim")}>
        {count}
      </span>
    </button>
  );
}

interface AlertCardProps {
  alert: Alert;
  onResolve: (id: string) => void;
}

function AlertCard({ alert, onResolve }: AlertCardProps) {
  const isHigh = alert.severity === 'high';

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
      className={cn(
        "bg-surface rounded-lg overflow-hidden border border-border transition-all",
        alert.resolved ? "opacity-60" : isHigh ? "border-danger/30" : "border-warning/30"
      )}>
      <div className="p-6 md:p-8 flex flex-col md:flex-row gap-6">
        <div className={cn(
          "w-12 h-12 rounded flex items-center justify-center shrink-0 shadow-inner",
          isHigh ? "bg-danger text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]" : "bg-warning text-white shadow-[0_0_15px_rgba(245,158,11,0.3)]"
        )}>
          {isHigh ? <ShieldAlert size={24} /> : <AlertTriangle size={24} />}
        </div>

        <div className="flex-1 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <span className={cn(
                "text-[9px] uppercase font-black px-2 py-0.5 rounded tracking-[0.1em] border",
                isHigh ? "bg-danger/10 text-danger border-danger/20" : "bg-warning/10 text-warning border-warning/20"
              )}>
                {alert.severity === 'high' ? 'Crítico — Prioridade de Auditoria' : 'Médio — Investigação Recomendada'}
              </span>
              <h3 className="text-lg font-bold text-text mt-2 uppercase tracking-tight">{alert.description}</h3>
            </div>
            <div className="flex items-center gap-2 text-text-dim text-[11px] font-semibold font-mono uppercase">
              <Clock size={12} />
              {format(parseISO(alert.createdAt), "HH:mm '•' dd/MM")}
            </div>
          </div>

          <p className="text-text-dim text-[13px] leading-relaxed font-medium">
            O motor de regras detectou este comportamento anômalo baseado no cruzamento de dados de{' '}
            {alert.type === 'card_gap' ? 'sistemas financeiros externos' : 'sensores de presença e vendas'}.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-2 text-xs">
            <div className="bg-surface-alt p-3 rounded border border-border">
              <p className="text-[10px] uppercase font-bold text-text-dim tracking-widest">Local</p>
              <div className="flex items-center gap-1.5 mt-1 font-bold text-text">
                <MapPin size={12} className="text-primary" /> Bar Central
              </div>
            </div>
            <div className="bg-surface-alt p-3 rounded border border-border">
              <p className="text-[10px] uppercase font-bold text-text-dim tracking-widest">Regra_Code</p>
              <div className="mt-1 font-mono font-bold text-text uppercase truncate">{alert.type}</div>
            </div>
            {alert.context?.diff && (
              <div className="bg-danger/5 p-3 rounded border border-danger/20 col-span-2">
                <p className="text-[10px] uppercase font-bold text-danger tracking-widest">Divergência_Gap</p>
                <div className="mt-1 font-mono font-black text-danger text-sm">
                  {Math.abs(alert.context.diff).toLocaleString('pt-br', { style: 'currency', currency: 'BRL' })}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            {!alert.resolved && (
              <button onClick={() => onResolve(alert.id)}
                className="bg-primary text-white px-6 py-2.5 rounded font-black uppercase text-[11px] tracking-[0.1em] hover:bg-primary/90 transition-all flex items-center gap-2 group shadow-xl shadow-primary/20">
                <CheckCircle2 size={16} className="group-hover:scale-110 transition-transform" />
                Auditado & Validado
              </button>
            )}
            <button onClick={() => window.open(notificationService.getWhatsAppLink(alert), '_blank')}
              className="bg-surface border border-border text-text-dim px-6 py-2.5 rounded font-black uppercase text-[11px] tracking-[0.1em] hover:text-success hover:border-success/50 transition-all flex items-center gap-2 group">
              <MessageCircle size={16} className="group-hover:scale-110 transition-transform" />
              Notificar Staff
            </button>
          </div>

          {alert.resolved && (
            <div className="flex items-center gap-2 pt-2 text-success font-black text-[11px] uppercase tracking-widest">
              <History size={14} />
              Resolvido por {alert.resolvedBy?.split(' ')[0]}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
