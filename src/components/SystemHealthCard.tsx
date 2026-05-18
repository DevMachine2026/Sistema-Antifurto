import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Activity, Bell, Cpu, Users, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCurrentEstablishmentId } from '../lib/tenant';
import { cn } from '../lib/utils';

type RowState = 'ok' | 'warn' | 'bad' | 'loading';

interface HealthRow {
  id: string;
  state: RowState;
  label: string;
  detail: string;
}

function dot(state: RowState) {
  if (state === 'loading') return 'bg-border animate-pulse';
  if (state === 'ok') return 'bg-success';
  if (state === 'warn') return 'bg-warning';
  return 'bg-danger';
}

function formatAgo(iso: string | null, t: TFunction): string {
  if (!iso) return t('health.never');
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return t('health.justNow');
  if (min < 60) return t('health.minutesAgo', { count: min });
  return t('health.hoursAgo', { count: Math.floor(min / 60) });
}

interface Props {
  onGoTo?: (tab: string) => void;
}

const ROW_ICONS = { notif: Bell, agent: Cpu, people: Users, alerts: Activity } as const;

export default function SystemHealthCard({ onGoTo }: Props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<HealthRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const estId = getCurrentEstablishmentId();

    const [
      { data: settings },
      { data: agents },
      { count: alertCount },
      peopleRes,
    ] = await Promise.all([
      supabase
        .from('settings')
        .select('telegram_chat_id, whatsapp_number')
        .eq('establishment_id', estId)
        .single(),
      supabase
        .from('agent_configs')
        .select('id')
        .eq('establishment_id', estId)
        .eq('active', true)
        .limit(1),
      supabase
        .from('alerts')
        .select('id', { count: 'exact', head: true })
        .eq('establishment_id', estId)
        .eq('resolved', false),
      supabase
        .from('people_count_events')
        .select('recorded_at')
        .eq('establishment_id', estId)
        .order('recorded_at', { ascending: false })
        .limit(1),
    ]);

    const agent = agents?.[0];
    let agentState: RowState = 'bad';
    let agentDetail = t('health.agentMissing');
    if (agent) {
      const { data: hb } = await supabase
        .from('agent_heartbeats')
        .select('reported_at')
        .eq('agent_id', agent.id)
        .order('reported_at', { ascending: false })
        .limit(1);
      const last = hb?.[0]?.reported_at;
      if (last && Date.now() - new Date(last).getTime() < 10 * 60_000) {
        agentState = 'ok';
        agentDetail = t('health.agentOnline', { ago: formatAgo(last, t) });
      } else if (last) {
        agentState = 'warn';
        agentDetail = t('health.agentStale', { ago: formatAgo(last, t) });
      } else {
        agentState = 'warn';
        agentDetail = t('health.agentNever');
      }
    }

    const telegramOk = !!(settings?.telegram_chat_id && String(settings.telegram_chat_id).trim());
    const whatsappOk = !!(settings?.whatsapp_number && String(settings.whatsapp_number).trim());
    const notifState: RowState = telegramOk || whatsappOk ? 'ok' : 'bad';
    const notifDetail = telegramOk
      ? t('health.telegramOk')
      : whatsappOk
        ? t('health.whatsappOk')
        : t('health.notifMissing');

    const lastPeople = peopleRes.data?.[0]?.recorded_at ?? null;
    const peopleState: RowState = lastPeople
      ? Date.now() - new Date(lastPeople).getTime() < 60 * 60_000
        ? 'ok'
        : 'warn'
      : 'warn';
    const peopleDetail = lastPeople
      ? t('health.peopleLast', { ago: formatAgo(lastPeople, t) })
      : t('health.peopleNever');

    const openAlerts = alertCount ?? 0;
    const alertState: RowState = openAlerts === 0 ? 'ok' : openAlerts >= 3 ? 'bad' : 'warn';
    const alertDetail =
      openAlerts === 0
        ? t('health.alertsClear')
        : t('health.alertsOpen', { count: openAlerts });

    setRows([
      { id: 'notif', state: notifState, label: t('health.rowNotif'), detail: notifDetail },
      { id: 'agent', state: agentState, label: t('health.rowAgent'), detail: agentDetail },
      { id: 'people', state: peopleState, label: t('health.rowPeople'), detail: peopleDetail },
      { id: 'alerts', state: alertState, label: t('health.rowAlerts'), detail: alertDetail },
    ]);
    setLoading(false);
  }, [t]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const overall: RowState = loading
    ? 'loading'
    : rows.some((r) => r.state === 'bad')
      ? 'bad'
      : rows.some((r) => r.state === 'warn')
        ? 'warn'
        : 'ok';

  const borderColor =
    overall === 'ok' ? 'var(--color-success)' : overall === 'warn' ? 'var(--color-warning)' : 'var(--color-danger)';

  const headline = loading
    ? t('health.titleLoading')
    : overall === 'ok'
      ? t('health.titleOk')
      : overall === 'warn'
        ? t('health.titleWarn')
        : t('health.titleBad');

  const fixTab =
    rows.find((r) => r.id === 'notif' && r.state === 'bad')
      ? 'settings'
      : rows.find((r) => r.id === 'agent' && r.state !== 'ok')
        ? 'onboarding'
        : 'readiness';

  return (
    <div
      className="rounded-lg border border-border bg-surface p-5 shadow-sm"
      style={{ borderLeftWidth: 3, borderLeftColor: borderColor }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-bold uppercase tracking-wider text-text">{t('health.cardTitle')}</h3>
          <p className="text-sm font-semibold text-text mt-0.5">{headline}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="p-2 rounded-lg border border-border text-text-dim hover:text-text transition-colors"
          aria-label={t('common.refresh')}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <ul className="mt-4 space-y-3">
        {loading ? (
          <li className="flex items-center gap-2 text-text-dim text-xs">
            <Loader2 size={14} className="animate-spin" />
            {t('health.loading')}
          </li>
        ) : (
          rows.map((row) => {
            const Icon = ROW_ICONS[row.id as keyof typeof ROW_ICONS] ?? Activity;
            return (
              <li key={row.id} className="flex items-start gap-3">
                <span className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', dot(row.state))} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-text flex items-center gap-1.5">
                    <Icon size={12} className="text-primary shrink-0" />
                    {row.label}
                  </p>
                  <p className="text-[11px] text-text-dim mt-0.5">{row.detail}</p>
                </div>
              </li>
            );
          })
        )}
      </ul>

      {onGoTo && !loading && overall !== 'ok' && (
        <button
          type="button"
          onClick={() => onGoTo(fixTab)}
          className="mt-4 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-primary hover:underline"
        >
          {t('health.fixCta')}
          <ChevronRight size={12} />
        </button>
      )}
    </div>
  );
}
