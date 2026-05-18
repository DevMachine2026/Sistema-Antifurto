import { motion } from 'motion/react';
import { Shield, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { AiRiskLevel } from '../../lib/aiTypes';

const CONFIG: Record<
  AiRiskLevel,
  { label: string; className: string; icon: typeof Shield }
> = {
  low: {
    label: 'Baixo',
    className: 'bg-success/10 text-success border-success/30',
    icon: ShieldCheck,
  },
  medium: {
    label: 'Médio',
    className: 'bg-warning/10 text-warning border-warning/30',
    icon: ShieldQuestion,
  },
  high: {
    label: 'Alto',
    className: 'bg-danger/10 text-danger border-danger/30',
    icon: ShieldAlert,
  },
  critical: {
    label: 'Crítico',
    className: 'bg-danger text-white border-danger shadow-[0_0_20px_rgba(239,68,68,0.35)]',
    icon: Shield,
  },
};

interface Props {
  level: AiRiskLevel;
  score: number;
  compact?: boolean;
}

export default function RiskScoreBadge({ level, score, compact }: Props) {
  const cfg = CONFIG[level] ?? CONFIG.medium;
  const Icon = cfg.icon;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border px-3 py-2',
        cfg.className,
        compact && 'px-2 py-1',
      )}
    >
      <Icon size={compact ? 14 : 18} />
      <motion.div
        className="leading-tight"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <p className={cn('font-black uppercase tracking-wider', compact ? 'text-[9px]' : 'text-[10px]')}>
          Risco {cfg.label}
        </p>
        {!compact && (
          <p className="text-[11px] font-mono opacity-90">Score {score}/100</p>
        )}
      </motion.div>
    </div>
  );
}
