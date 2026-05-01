import { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Users, TrendingUp, AlertCircle, Wallet } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts';
import { dataService } from '../services/dataService';
import { supabase } from '../lib/supabase';
import { getCurrentEstablishmentId } from '../lib/tenant';
import { formatCurrency, cn } from '../lib/utils';
import { Transaction, PeopleCountEvent, Alert, ImportBatch } from '../types';
import { format, parseISO } from 'date-fns';

export default function Dashboard() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [people, setPeople] = useState<PeopleCountEvent[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [lastBatch, setLastBatch] = useState<ImportBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartReady, setChartReady] = useState(false);

  useEffect(() => { setChartReady(true); }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [txs, ppl, als, batches] = await Promise.all([
          dataService.getTransactions(),
          dataService.getPeopleCount(),
          dataService.getAlerts(),
          dataService.getBatches(),
        ]);
        if (!active) return;
        setTransactions(txs);
        setPeople(ppl);
        setAlerts(als.filter(a => !a.resolved));
        setLastBatch(batches[0] ?? null);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    const estId = getCurrentEstablishmentId();
    const filter = estId ? `establishment_id=eq.${estId}` : undefined;

    const channel = supabase
      .channel('dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'people_count_events', ...(filter && { filter }) }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts',              ...(filter && { filter }) }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions',        ...(filter && { filter }) }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'import_batches',      ...(filter && { filter }) }, () => load())
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const stats = useMemo(() => {
    const totalSales = transactions.reduce((acc, t) => acc + t.amount, 0);
    const peopleInside = people[people.length - 1]?.peopleInside || 0;
    const highAlerts = alerts.filter(a => a.severity === 'high').length;
    const stTotal = transactions.filter(t => t.source === 'st_ingressos').reduce((a, t) => a + t.amount, 0);
    const pagbankTotal = transactions.filter(t => t.source === 'pagbank').reduce((a, t) => a + t.amount, 0);
    return { totalSales, peopleInside, highAlerts, financialGap: Math.abs(stTotal - pagbankTotal) };
  }, [transactions, people, alerts]);

  const chartData = useMemo(() => {
    const hours: Record<string, { time: string; sales: number; people: number }> = {};
    transactions.forEach(t => {
      const hour = format(parseISO(t.occurredAt), 'HH:00');
      if (!hours[hour]) hours[hour] = { time: hour, sales: 0, people: 0 };
      hours[hour].sales += t.amount;
    });
    people.forEach(p => {
      const hour = format(parseISO(p.recordedAt), 'HH:00');
      if (hours[hour]) hours[hour].people = p.peopleInside;
    });
    return Object.values(hours).sort((a, b) => a.time.localeCompare(b.time));
  }, [transactions, people]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="text-text-dim text-xs font-mono uppercase tracking-widest animate-pulse">
          Carregando dados...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Consumo (Sistemas)"
          value={formatCurrency(transactions.filter(t => t.source === 'st_ingressos').reduce((a, t) => a + t.amount, 0))}
          icon={Wallet}
        />
        <MetricCard
          title="Pagamentos (Maquineta)"
          value={formatCurrency(transactions.filter(t => t.source === 'pagbank').reduce((a, t) => a + t.amount, 0))}
          icon={TrendingUp}
        />
        <MetricCard
          title="Gap Auditoria (R02)"
          value={`+ ${formatCurrency(stats.financialGap)}`}
          icon={AlertCircle}
          isDanger={stats.financialGap > 200}
        />
        <MetricCard
          title="Clientes no Salão"
          value={`${stats.peopleInside} pessoas`}
          icon={Users}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-surface p-5 rounded-lg border border-border shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-[13px] uppercase font-semibold tracking-wider text-text">
              DYNAMICS_CROSSING :: CONSUMO VS FLUXO
            </h3>
            <div className="text-[10px] text-text-dim uppercase font-mono">Varredura: 30 min</div>
          </div>
          <div className="h-[300px] w-full">
            {chartReady && <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2D2D35" />
                <XAxis dataKey="time" axisLine={false} tickLine={false}
                  tick={{ fill: '#71717A', fontSize: 10, fontFamily: 'JetBrains Mono' }} dy={10} />
                <YAxis axisLine={false} tickLine={false}
                  tick={{ fill: '#71717A', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                <Tooltip contentStyle={{ backgroundColor: '#1C1C21', borderRadius: '4px', border: '1px solid #2D2D35', fontSize: '12px', fontFamily: 'JetBrains Mono' }} itemStyle={{ color: '#E4E4E7' }} />
                <Area type="stepAfter" dataKey="sales" stroke="#3B82F6" strokeWidth={2} fillOpacity={1} fill="url(#colorSales)" name="Vendas (R$)" />
                <Area type="stepAfter" dataKey="people" stroke="rgba(228, 228, 231, 0.2)" strokeWidth={1} strokeDasharray="4 4" fillOpacity={0} name="Pessoas" />
              </AreaChart>
            </ResponsiveContainer>}
          </div>
          <div className="mt-4 pt-4 border-t border-border flex gap-6">
            <div className="flex items-center gap-2 text-[11px] font-medium text-text">
              <div className="w-2.5 h-2.5 bg-primary rounded-sm" /> Vendas Processadas
            </div>
            <div className="flex items-center gap-2 text-[11px] font-medium text-text">
              <div className="w-2.5 h-2.5 bg-text-dim/20 rounded-sm" /> Fluxo de Câmera (R01)
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-lg border border-border shadow-sm flex flex-col">
          <div className="p-5 border-b border-border">
            <h3 className="text-[13px] uppercase font-semibold tracking-wider text-text">Alertas de Anomalia</h3>
          </div>
          <div className="flex-1 overflow-auto divide-y divide-border">
            {alerts.length === 0 ? (
              <div className="p-10 text-center text-text-dim text-xs font-mono">
                SISTEMA_LIMPO :: AGUARDANDO_EVENTOS
              </div>
            ) : (
              alerts.slice(0, 6).map(alert => (
                <div key={alert.id} className="p-4 flex gap-3 group hover:bg-surface-alt transition-colors cursor-pointer">
                  <div className={cn(
                    "w-2 h-2 rounded-full mt-1.5 shrink-0",
                    alert.severity === 'high' ? "bg-danger shadow-[0_0_8px_#EF4444]" : "bg-warning shadow-[0_0_8px_#F59E0B]"
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-text truncate uppercase tracking-tight">{alert.description}</p>
                    <p className="text-[10px] text-text-dim uppercase mt-1 leading-relaxed">
                      {format(parseISO(alert.createdAt), 'HH:mm')} • {alert.severity === 'high' ? 'ALTA CRITICIDADE' : 'MÉDIA'}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="p-4 bg-surface-alt mt-auto border-t border-border">
            <div className="text-[10px] text-text-dim uppercase tracking-[0.5px] mb-1">Última Importação</div>
            {lastBatch ? (
              <>
                <div className="text-[12px] font-mono text-text truncate">
                  {lastBatch.filename}
                </div>
                <div className="text-[10px] text-text-dim font-mono mt-0.5">
                  {format(parseISO(lastBatch.createdAt), 'dd/MM/yy HH:mm')}
                </div>
                <div className={`inline-block mt-2 px-2 py-0.5 rounded bg-surface border border-border text-[10px] font-bold uppercase tracking-wider ${lastBatch.status === 'failed' ? 'text-danger border-danger/30' : 'text-success'}`}>
                  Lote #{String(lastBatch.rowsImported).padStart(4, '0')} • {lastBatch.status === 'failed' ? 'ERRO' : 'OK'}
                </div>
              </>
            ) : (
              <div className="text-[12px] font-mono text-text-dim">
                Nenhuma importação registrada
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, isDanger }: any) {
  return (
    <motion.div whileHover={{ y: -2 }} className="bg-surface p-5 rounded-lg border border-border shadow-sm">
      <h4 className="text-text-dim text-[11px] font-semibold uppercase tracking-wider mb-2">{title}</h4>
      <p className={cn("text-xl font-bold font-mono tracking-tight", isDanger ? "text-danger" : "text-text")}>
        {value}
      </p>
    </motion.div>
  );
}
