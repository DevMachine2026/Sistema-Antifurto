import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  Circle,
  Loader2,
  RefreshCw,
  Radio,
  Shield,
  ShoppingCart,
  Wallet,
  Webhook,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCurrentEstablishmentId } from '../lib/tenant';
import { cn } from '../lib/utils';

type CheckState = 'ok' | 'pending' | 'loading';

interface Checks {
  webhookToken: CheckState;
  notifications: CheckState;
  cameraIngest: CheckState;
  cashIngest: CheckState;
  salesIngest: CheckState;
  streamReady: CheckState;
}

function rowState(done: boolean): CheckState {
  return done ? 'ok' : 'pending';
}

export default function Readiness() {
  const { t } = useTranslation();
  const establishmentId = getCurrentEstablishmentId();
  const [loading, setLoading] = useState(true);
  const [checks, setChecks] = useState<Checks>({
    webhookToken: 'loading',
    notifications: 'loading',
    cameraIngest: 'loading',
    cashIngest: 'loading',
    salesIngest: 'loading',
    streamReady: 'loading',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setChecks({
      webhookToken: 'loading',
      notifications: 'loading',
      cameraIngest: 'loading',
      cashIngest: 'loading',
      salesIngest: 'loading',
      streamReady: 'loading',
    });

    const [
      { data: settings },
      peopleRes,
      cashRes,
      txRes,
      camerasRes,
    ] = await Promise.all([
      supabase
        .from('settings')
        .select('webhook_token, telegram_chat_id, whatsapp_number')
        .eq('establishment_id', establishmentId)
        .single(),
      supabase
        .from('people_count_events')
        .select('id', { count: 'exact', head: true })
        .eq('establishment_id', establishmentId),
      supabase
        .from('cash_payment_events')
        .select('id', { count: 'exact', head: true })
        .eq('establishment_id', establishmentId),
      supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('establishment_id', establishmentId),
      supabase
        .from('cameras')
        .select('id, status')
        .eq('establishment_id', establishmentId),
    ]);

    const tokenOk = !!(settings?.webhook_token && String(settings.webhook_token).length > 8);
    const notifOk = !!(
      (settings?.telegram_chat_id && String(settings.telegram_chat_id).trim()) ||
      (settings?.whatsapp_number && String(settings.whatsapp_number).trim())
    );
    const peopleCount = peopleRes.count ?? 0;
    const cashCount = cashRes.count ?? 0;
    const txCount = txRes.count ?? 0;
    const cams = camerasRes.data ?? [];
    const onlineCams = cams.filter((c: { status: string }) => c.status === 'online').length;

    setChecks({
      webhookToken: rowState(tokenOk),
      notifications: rowState(notifOk),
      cameraIngest: rowState(peopleCount > 0),
      cashIngest: rowState(cashCount > 0),
      salesIngest: rowState(txCount > 0),
      streamReady: rowState(onlineCams > 0 && cams.length > 0),
    });
    setLoading(false);
  }, [establishmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const coreOk =
    checks.webhookToken === 'ok' &&
    checks.notifications === 'ok' &&
    (checks.cameraIngest === 'ok' || checks.salesIngest === 'ok');

  const rows: {
    key: keyof Checks;
    icon: typeof Webhook;
    hintKey: string;
  }[] = [
    { key: 'webhookToken', icon: Webhook, hintKey: 'readiness.hints.integrations' },
    { key: 'notifications', icon: Shield, hintKey: 'readiness.hints.settings' },
    { key: 'cameraIngest', icon: Radio, hintKey: 'readiness.hints.cameraOrIntegrations' },
    { key: 'cashIngest', icon: Wallet, hintKey: 'readiness.hints.cashWebhook' },
    { key: 'salesIngest', icon: ShoppingCart, hintKey: 'readiness.hints.uploadOrSt' },
    { key: 'streamReady', icon: Radio, hintKey: 'readiness.hints.camerasOnline' },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-text">{t('readiness.title')}</h1>
        <p className="text-sm text-text-dim leading-relaxed">{t('readiness.subtitle')}</p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 mt-2 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide border border-border bg-surface hover:bg-surface-alt text-text transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {t('readiness.refresh')}
        </button>
      </header>

      <div
        className={cn(
          'rounded-xl border p-4 text-sm',
          coreOk ? 'border-success/30 bg-success/5 text-text' : 'border-border bg-surface text-text-dim',
        )}
      >
        {coreOk ? t('readiness.summaryOk') : t('readiness.summaryWarn')}
      </div>

      <ul className="space-y-3">
        {rows.map(({ key, icon: Icon, hintKey }) => {
          const st = checks[key];
          const done = st === 'ok';
          return (
            <li
              key={key}
              className={cn(
                'flex gap-4 rounded-xl border p-4 items-start',
                done ? 'border-success/25 bg-surface' : 'border-border bg-surface-alt/50',
              )}
            >
              <div className="shrink-0 mt-0.5">
                {loading || st === 'loading' ? (
                  <Loader2 size={20} className="animate-spin text-text-dim" />
                ) : done ? (
                  <CheckCircle2 size={20} className="text-success" aria-hidden />
                ) : (
                  <Circle size={20} className="text-text-dim" aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <Icon size={14} className="text-text-dim shrink-0" aria-hidden />
                  <span className="font-semibold text-text text-sm">{t(`readiness.items.${key}`)}</span>
                </div>
                <p className="text-xs text-text-dim leading-relaxed">{t(hintKey)}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
