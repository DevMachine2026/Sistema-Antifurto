import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { Brain, Loader2 } from 'lucide-react';
import { aiService } from '../../services/aiService';
import type { AiAnalysisResult } from '../../lib/aiTypes';

interface Props {
  alertId: string;
}

export default function AlertAiBrief({ alertId }: Props) {
  const { t } = useTranslation();
  const [result, setResult] = useState<AiAnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await aiService.analyze('alert_investigation', { alertId });
        if (active) setResult(res.result);
      } catch {
        if (active) setResult(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [alertId]);

  if (loading) {
    return (
      <motion.div className="flex items-center gap-2 text-[11px] text-text-dim py-2">
        <Loader2 size={12} className="animate-spin" />
        {t('ai.investigating')}
      </motion.div>
    );
  }

  const inv = result?.alert_investigation;
  if (!inv) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-lg border border-primary/25 bg-primary/5 p-4 space-y-3"
    >
      <div className="flex items-center gap-2 text-primary">
        <Brain size={14} />
        <span className="text-[10px] font-bold uppercase tracking-wider">{t('ai.investigationTitle')}</span>
      </div>
      <p className="text-[12px] text-text leading-relaxed">{inv.hypothesis}</p>
      <motion.div>
        <p className="text-[10px] font-bold uppercase text-text-dim mb-1">{t('ai.steps')}</p>
        <ol className="list-decimal list-inside text-[11px] text-text-dim space-y-0.5">
          {inv.investigation_steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </motion.div>
      <p className="text-[11px] font-semibold text-text border-t border-border pt-2">
        → {inv.operational_action}
      </p>
    </motion.div>
  );
}
