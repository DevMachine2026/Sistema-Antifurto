import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { Brain, RefreshCw, Sparkles, ChevronRight, Loader2 } from 'lucide-react';
import { aiService } from '../../services/aiService';
import type { AiAnalyzeResponse } from '../../lib/aiTypes';
import RiskScoreBadge from './RiskScoreBadge';
import { cn } from '../../lib/utils';

interface Props {
  onGoExecutive?: () => void;
}

export default function IntelligencePanel({ onGoExecutive }: Props) {
  const { t } = useTranslation();
  const [data, setData] = useState<AiAnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await aiService.analyze('dashboard', { forceRefresh: force });
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

  return (
    <div
      className="rounded-lg border border-border bg-surface overflow-hidden shadow-sm"
      style={{ borderLeftWidth: 3, borderLeftColor: 'var(--color-primary)' }}
    >
      <div
        className="px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3"
        style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, transparent 60%)' }}
      >
        <motion.div className="flex items-center gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="w-10 h-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
            <Brain size={20} />
          </div>
          <motion.div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary">
              {t('ai.analystLabel')}
            </p>
            <h3 className="text-sm font-bold text-text">{t('ai.dashboardTitle')}</h3>
          </motion.div>
        </motion.div>
        <div className="flex items-center gap-2">
          {data && (
            <RiskScoreBadge level={data.risk_level} score={data.risk_score} compact />
          )}
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={loading}
            className="p-2 rounded-lg border border-border text-text-dim hover:text-text"
            aria-label={t('common.refresh')}
          >
            <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {loading && !r && (
          <div className="flex items-center gap-2 text-text-dim text-xs">
            <Loader2 size={16} className="animate-spin text-primary" />
            {t('ai.analyzing')}
          </div>
        )}
        {error && <p className="text-danger text-xs">{error}</p>}
        {r && (
          <>
            <p className="text-sm font-semibold text-text leading-snug">{r.headline}</p>
            <ul className="space-y-2">
              {(r.insights ?? []).slice(0, 4).map((line, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="flex gap-2 text-[12px] text-text-dim leading-relaxed"
                >
                  <Sparkles size={12} className="text-primary shrink-0 mt-0.5" />
                  <span>{line}</span>
                </motion.li>
              ))}
            </ul>
            {(r.recommended_actions?.length ?? 0) > 0 && (
              <div className="pt-2 border-t border-border">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-dim mb-2">
                  {t('ai.recommended')}
                </p>
                <ul className="text-[11px] text-text space-y-1 list-disc list-inside">
                  {r.recommended_actions!.slice(0, 3).map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
            {data?.cached && (
              <p className="text-[10px] text-text-dim font-mono">{t('ai.cachedHint')}</p>
            )}
          </>
        )}
        {onGoExecutive && (
          <button
            type="button"
            onClick={onGoExecutive}
            className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-primary hover:underline"
          >
            {t('ai.executiveCta')}
            <ChevronRight size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
