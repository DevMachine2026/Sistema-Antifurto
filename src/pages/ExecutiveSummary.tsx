import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import {
  Brain, RefreshCw, TrendingUp, Clock, Users, AlertTriangle, Loader2,
} from 'lucide-react';
import { aiService } from '../services/aiService';
import type { AiAnalyzeResponse } from '../lib/aiTypes';
import RiskScoreBadge from '../components/ai/RiskScoreBadge';
import { cn } from '../lib/utils';

export default function ExecutiveSummary() {
  const { t } = useTranslation();
  const [data, setData] = useState<AiAnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await aiService.analyze('executive', { forceRefresh: force });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('ai.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const r = data?.result;
  const shift = r?.shift_summary;

  return (
    <div className="max-w-4xl mx-auto pb-16 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-primary mb-2">
            <Brain size={22} />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em]">{t('ai.executiveLabel')}</span>
          </div>
          <h1 className="text-3xl font-black text-text uppercase tracking-tight">{t('ai.executivePageTitle')}</h1>
          <p className="text-text-dim text-sm mt-1 max-w-xl">{t('ai.executiveSubtitle')}</p>
        </div>
        <motion.div className="flex items-center gap-3">
          {data && <RiskScoreBadge level={data.risk_level} score={data.risk_score} />}
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-xs font-bold uppercase tracking-wider hover:bg-surface-alt"
          >
            <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
            {t('common.refresh')}
          </button>
        </motion.div>
      </div>

      {loading && !r && (
        <div className="flex items-center justify-center py-24 text-text-dim gap-2">
          <Loader2 className="animate-spin text-primary" size={20} />
          {t('ai.analyzing')}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-6 text-danger text-sm">{error}</div>
      )}

      {r && (
        <>
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-border bg-surface p-8 shadow-sm"
            style={{ background: 'linear-gradient(180deg, var(--color-surface) 0%, var(--color-surface-alt) 100%)' }}
          >
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-dim mb-3">{t('ai.executiveSummary')}</p>
            <p className="text-lg text-text leading-relaxed font-medium">
              {shift?.executive_summary ?? r.executive_summary ?? r.headline}
            </p>
          </motion.section>

          <div className="grid md:grid-cols-2 gap-6">
            <Card icon={AlertTriangle} title={t('ai.keyEvents')} items={shift?.key_events ?? r.insights?.slice(0, 5)} />
            <Card icon={Clock} title={t('ai.criticalHours')} items={shift?.critical_periods ?? r.critical_hours} />
            <Card icon={Users} title={t('ai.suspiciousOperators')} items={shift?.suspicious_operators ?? r.suspicious_operators} />
            <Card icon={TrendingUp} title={t('ai.businessInsights')} items={r.business_insights} />
          </div>

          {(r.recommended_actions?.length ?? 0) > 0 && (
            <section className="rounded-lg border border-primary/30 bg-primary/5 p-6">
              <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-3">{t('ai.recommended')}</p>
              <ul className="space-y-2">
                {r.recommended_actions!.map((a, i) => (
                  <li key={i} className="text-sm text-text flex gap-2">
                    <span className="text-primary font-bold">•</span>
                    {a}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  items,
}: {
  icon: typeof Brain;
  title: string;
  items?: string[];
}) {
  if (!items?.length) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-lg border border-border bg-surface p-5"
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon size={16} className="text-primary" />
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-text">{title}</h3>
      </div>
      <ul className="space-y-2 text-[12px] text-text-dim leading-relaxed">
        {items.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </motion.div>
  );
}
