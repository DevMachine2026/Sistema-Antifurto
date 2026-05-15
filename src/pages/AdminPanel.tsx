import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, Users, CheckCircle2, XCircle, Clock, RefreshCw, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { format, parseISO } from 'date-fns';
import { cn } from '../lib/utils';

interface MerchantRow {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  active: boolean;
  created_at: string;
  user_count: number;
}

export default function AdminPanel() {
  const { t } = useTranslation();
  const [merchants, setMerchants] = useState<MerchantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [telegramStatus, setTelegramStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: ests, error: estErr } = await supabase
      .from('establishments')
      .select('id, name, slug, address, phone, active, created_at')
      .order('created_at', { ascending: false });

    if (estErr) {
      setError(t('admin.loadError'));
      setLoading(false);
      return;
    }

    const { data: memberships } = await supabase
      .from('user_establishments')
      .select('establishment_id')
      .eq('active', true);

    const countMap: Record<string, number> = {};
    (memberships ?? []).forEach((m: any) => {
      countMap[m.establishment_id] = (countMap[m.establishment_id] ?? 0) + 1;
    });

    setMerchants(
      (ests ?? []).map((e: any) => ({ ...e, user_count: countMap[e.id] ?? 0 }))
    );
    setLoading(false);
  }, [t]);

  useEffect(() => { load(); }, [load]);

  async function toggleActive(id: string, current: boolean) {
    setTogglingId(id);
    const { error } = await supabase
      .from('establishments')
      .update({ active: !current })
      .eq('id', id);
    if (!error) {
      setMerchants((prev) =>
        prev.map((m) => (m.id === id ? { ...m, active: !current } : m))
      );
    }
    setTogglingId(null);
  }

  async function registerTelegramWebhook() {
    setTelegramStatus('loading');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telegram-connect?setup=1`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      });
      const body = await res.json();
      setTelegramStatus(body?.ok === true || body?.result === true ? 'ok' : 'error');
    } catch {
      setTelegramStatus('error');
    }
  }

  const total    = merchants.length;
  const active   = merchants.filter((m) => m.active).length;
  const inactive = merchants.filter((m) => !m.active).length;

  const tableCols = [
    t('admin.cols.establishment'),
    t('admin.cols.address'),
    t('admin.cols.users'),
    t('admin.cols.since'),
    t('admin.cols.status'),
  ];

  return (
    <div className="space-y-8">

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">{t('admin.title')}</h1>
          <p className="text-text-dim text-sm mt-1">{t('admin.subtitle')}</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-surface border border-border rounded text-[11px] font-semibold text-text-dim hover:text-text uppercase tracking-wider transition-colors"
        >
          <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
          {t('common.refresh')}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label={t('admin.totalClients')} value={total} Icon={Building2} />
        <KpiCard label={t('admin.activeLabel')} value={active} Icon={CheckCircle2} color="text-success" accent="border-success/20 bg-success/5" />
        <KpiCard label={t('admin.inactiveLabel')} value={inactive} Icon={XCircle} color="text-danger" accent="border-danger/20 bg-danger/5" />
      </div>

      <div className="bg-surface border border-border rounded-lg overflow-x-auto">
        <div className="hidden md:grid grid-cols-[1fr_160px_120px_100px_170px] gap-4 px-6 py-3 bg-surface-alt border-b border-border min-w-[700px]">
          {tableCols.map((col) => (
            <span key={col} className="text-[10px] font-black uppercase tracking-widest text-text-dim">{col}</span>
          ))}
        </div>

        {error && (
          <div className="px-6 py-4 text-danger text-sm">{error}</div>
        )}

        {loading ? (
          <div className="px-6 py-16 text-center text-text-dim text-xs font-mono uppercase tracking-widest animate-pulse">
            {t('admin.loading')}
          </div>
        ) : merchants.length === 0 ? (
          <div className="px-6 py-16 text-center text-text-dim text-xs font-mono uppercase tracking-widest">
            {t('admin.noClients')}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {merchants.map((m) => (
              <div
                key={m.id}
                className="grid grid-cols-1 md:grid-cols-[1fr_160px_120px_100px_170px] gap-4 items-center px-6 py-4 hover:bg-surface-alt/40 transition-colors min-w-[700px]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-md bg-surface-alt border border-border flex items-center justify-center shrink-0">
                    <Building2 size={14} className="text-text-dim" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-text truncate">{m.name}</p>
                    <p className="text-[11px] text-text-dim font-mono truncate">{m.slug}</p>
                  </div>
                </div>

                <p className="text-[12px] text-text-dim truncate hidden md:block">
                  {m.address ?? '—'}
                </p>

                <div className="hidden md:flex items-center gap-1.5 text-[12px] text-text-dim">
                  <Users size={12} className="shrink-0" />
                  {t('admin.users', { count: m.user_count })}
                </div>

                <div className="hidden md:flex items-center gap-1.5 text-[12px] text-text-dim">
                  <Clock size={12} className="shrink-0" />
                  {format(parseISO(m.created_at), 'dd/MM/yyyy')}
                </div>

                <div className="flex items-center gap-2">
                  <span className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border',
                    m.active
                      ? 'bg-success/10 text-success border-success/20'
                      : 'bg-danger/10 text-danger border-danger/20'
                  )}>
                    {m.active ? <CheckCircle2 size={9} /> : <XCircle size={9} />}
                    {m.active ? t('admin.active') : t('admin.inactive')}
                  </span>
                  <button
                    onClick={() => toggleActive(m.id, m.active)}
                    disabled={togglingId === m.id}
                    className={cn(
                      'px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest border transition-all',
                      m.active
                        ? 'bg-danger/10 border-danger/20 text-danger hover:bg-danger/20'
                        : 'bg-success/10 border-success/20 text-success hover:bg-success/20',
                      togglingId === m.id && 'opacity-40 cursor-not-allowed'
                    )}
                  >
                    {togglingId === m.id ? '...' : m.active ? t('admin.deactivate') : t('admin.activate')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {merchants.length > 0 && (
          <div className="px-6 py-3 bg-surface-alt border-t border-border">
            <p className="text-[10px] text-text-dim uppercase tracking-wider font-semibold">
              {total} {t('admin.clients', { count: total })} — {active} {t('admin.actives', { count: active })} · {inactive} {t('admin.inactives', { count: inactive })}
            </p>
          </div>
        )}
      </div>

      {/* ── Telegram Webhook Setup ── */}
      <div className="bg-surface border border-border rounded-lg p-6 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Send size={14} className="text-primary" />
          <span className="text-[12px] font-black uppercase tracking-widest text-text">{t('admin.telegram.sectionTitle')}</span>
        </div>
        <p className="text-text-dim text-xs leading-relaxed">{t('admin.telegram.sectionDesc')}</p>
        <div className="flex items-center gap-3">
          <button
            onClick={registerTelegramWebhook}
            disabled={telegramStatus === 'loading'}
            className="flex items-center gap-2 px-4 py-2 rounded text-[11px] font-black uppercase tracking-widest border transition-all bg-primary/10 border-primary/20 text-primary hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send size={12} />
            {telegramStatus === 'loading' ? t('admin.telegram.registering') : t('admin.telegram.registerWebhook')}
          </button>
          {telegramStatus === 'ok' && (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-success">
              <CheckCircle2 size={12} /> {t('admin.telegram.success')}
            </span>
          )}
          {telegramStatus === 'error' && (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-danger">
              <XCircle size={12} /> {t('admin.telegram.error')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, Icon, color = 'text-text', accent = 'border-border bg-surface' }: {
  label: string;
  value: number;
  Icon: any;
  color?: string;
  accent?: string;
}) {
  return (
    <div className={cn('rounded-lg border p-5 flex items-center gap-4', accent)}>
      <div className={cn('w-10 h-10 rounded-lg bg-surface-alt border border-border flex items-center justify-center shrink-0', color)}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-text-dim text-[11px] uppercase tracking-wider font-semibold">{label}</p>
        <p className={cn('text-3xl font-bold font-mono mt-0.5 tracking-tight', color)}>{value}</p>
      </div>
    </div>
  );
}
