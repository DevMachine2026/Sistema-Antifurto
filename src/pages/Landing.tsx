import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import {
  ShieldCheck, Camera, TrendingUp, AlertCircle, ArrowRight,
  Bell, Zap, Lock, CheckCircle2, BarChart3, Users, Store,
  Utensils, Music, ShoppingBag, Building2,
  Eye, Database, Cpu,
} from 'lucide-react';
import LanguageSwitcher from '../components/LanguageSwitcher';

interface LandingProps {
  onLogin: () => void;
  onRegister: () => void;
}

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
});

const fadeIn = (delay = 0) => ({
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { delay, duration: 0.6 },
});

export default function Landing({ onLogin, onRegister }: LandingProps) {
  const { t } = useTranslation();

  const SECTORS = [
    { icon: Utensils, label: t('landing.sectors.restaurants') },
    { icon: Music,    label: t('landing.sectors.nightClubs') },
    { icon: Store,    label: t('landing.sectors.barsAndPubs') },
    { icon: ShoppingBag, label: t('landing.sectors.retail') },
    { icon: Building2,   label: t('landing.sectors.events') },
    { icon: Users,       label: t('landing.sectors.franchises') },
  ];

  const RULES = [
    {
      code: 'R01',
      icon: Camera,
      title: t('landing.rules.r01.title'),
      desc: t('landing.rules.r01.desc'),
      color: 'var(--color-primary)',
      accent: 'rgba(79,124,255,0.12)',
      border: 'rgba(79,124,255,0.2)',
    },
    {
      code: 'R02',
      icon: TrendingUp,
      title: t('landing.rules.r02.title'),
      desc: t('landing.rules.r02.desc'),
      color: 'var(--color-warning)',
      accent: 'rgba(245,158,11,0.10)',
      border: 'rgba(245,158,11,0.2)',
    },
    {
      code: 'R05',
      icon: AlertCircle,
      title: t('landing.rules.r05.title'),
      desc: t('landing.rules.r05.desc'),
      color: 'var(--color-danger)',
      accent: 'rgba(240,82,82,0.10)',
      border: 'rgba(240,82,82,0.2)',
    },
  ];

  const STATS = [
    { value: t('landing.stats.alertTime.value'), label: t('landing.stats.alertTime.label'), sub: t('landing.stats.alertTime.sub') },
    { value: t('landing.stats.rules.value'),     label: t('landing.stats.rules.label'),     sub: t('landing.stats.rules.sub') },
    { value: t('landing.stats.isolation.value'), label: t('landing.stats.isolation.label'), sub: t('landing.stats.isolation.sub') },
    { value: t('landing.stats.monitoring.value'),label: t('landing.stats.monitoring.label'),sub: t('landing.stats.monitoring.sub') },
  ];

  const HOW = [
    { n: '01', icon: Camera,   title: t('landing.how.step1.title'), desc: t('landing.how.step1.desc') },
    { n: '02', icon: Database, title: t('landing.how.step2.title'), desc: t('landing.how.step2.desc') },
    { n: '03', icon: Bell,     title: t('landing.how.step3.title'), desc: t('landing.how.step3.desc') },
  ];

  const INTEGRATIONS = [
    { name: t('landing.integrations.camera.name'),    desc: t('landing.integrations.camera.desc'),    icon: Camera },
    { name: t('landing.integrations.pos.name'),       desc: t('landing.integrations.pos.desc'),       icon: BarChart3 },
    { name: t('landing.integrations.gateway.name'),   desc: t('landing.integrations.gateway.desc'),   icon: TrendingUp },
    { name: t('landing.integrations.telegram.name'),  desc: t('landing.integrations.telegram.desc'),  icon: Bell },
    { name: t('landing.integrations.whatsapp.name'),  desc: t('landing.integrations.whatsapp.desc'),  icon: Zap },
    { name: t('landing.integrations.raspberry.name'), desc: t('landing.integrations.raspberry.desc'), icon: Cpu },
  ];

  const PROBLEM_CASES = [
    { icon: Eye,       title: t('landing.problem.cases.fullRoom.title'),       desc: t('landing.problem.cases.fullRoom.desc') },
    { icon: TrendingUp,title: t('landing.problem.cases.gapMachine.title'),     desc: t('landing.problem.cases.gapMachine.desc') },
    { icon: Lock,      title: t('landing.problem.cases.cashManipulated.title'),desc: t('landing.problem.cases.cashManipulated.desc') },
  ];

  return (
    <div className="min-h-screen bg-bg text-text antialiased overflow-x-hidden">

      {/* ── NAV ─── */}
      <nav className="sticky top-0 z-50 glass border-b border-border">
        <div className="max-w-6xl mx-auto px-4 md:px-8 h-14 md:h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'rgba(79,124,255,0.12)', border: '1px solid rgba(79,124,255,0.25)' }}>
              <ShieldCheck size={14} style={{ color: 'var(--color-primary)' }} />
            </div>
            <span className="font-display font-bold text-[14px] md:text-[15px] tracking-wide whitespace-nowrap">
              Olho <span style={{ color: 'var(--color-primary)' }}>Vivo</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
            <LanguageSwitcher />
            <button
              onClick={onLogin}
              className="btn-ghost text-[12px] md:text-[13px] px-2 md:px-3 py-1.5"
            >
              {t('landing.nav.login')}
            </button>
            <button
              onClick={onRegister}
              className="inline-flex items-center gap-1.5 whitespace-nowrap px-3 md:px-4 py-2 rounded-lg text-[12px] md:text-[13px] font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.97]"
              style={{ background: 'var(--color-primary)' }}
            >
              {t('landing.nav.start')}
              <ArrowRight size={12} />
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ─── */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0"
          style={{ background: 'var(--gradient-hero)' }} />
        <div className="pointer-events-none absolute inset-0 opacity-[0.025]"
          style={{ backgroundImage: 'linear-gradient(var(--color-border) 1px,transparent 1px),linear-gradient(90deg,var(--color-border) 1px,transparent 1px)', backgroundSize: '60px 60px' }} />

        <div className="relative max-w-6xl mx-auto px-4 md:px-8 pt-24 pb-16 md:pt-32 md:pb-20 text-center">

          <motion.div {...fadeIn(0)}>
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-widest mb-6"
              style={{ background: 'rgba(79,124,255,0.1)', border: '1px solid rgba(79,124,255,0.25)', color: 'var(--color-primary)' }}>
              <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: 'var(--color-primary)' }} />
              {t('landing.hero.badge')}
            </span>
          </motion.div>

          <motion.h1 {...fadeUp(0.08)}
            className="font-display font-extrabold text-[36px] sm:text-[52px] md:text-[64px] leading-[1.04] tracking-[-0.02em] max-w-4xl mx-auto">
            {t('landing.hero.headlinePrefix')}{' '}
            <span className="text-gradient">{t('landing.hero.headlineHighlight')}</span>{' '}
            {t('landing.hero.headlineSuffix')}
          </motion.h1>

          <motion.p {...fadeUp(0.16)}
            className="mt-6 text-[16px] md:text-[18px] max-w-xl mx-auto leading-relaxed"
            style={{ color: 'var(--color-text-dim)' }}>
            {t('landing.hero.desc')}
          </motion.p>

          <motion.div {...fadeUp(0.22)}
            className="mt-7 flex flex-wrap items-center justify-center gap-2">
            {SECTORS.map(({ icon: Icon, label }) => (
              <span key={label}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium"
                style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border-strong)', color: 'var(--color-text-dim)' }}>
                <Icon size={11} />
                {label}
              </span>
            ))}
          </motion.div>

          <motion.div {...fadeUp(0.3)}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button onClick={onRegister}
              className="btn-primary w-full sm:w-auto px-7 py-3.5 rounded-xl text-[14px] font-semibold">
              {t('landing.hero.cta')} <ArrowRight size={15} />
            </button>
            <button onClick={onLogin}
              className="btn-secondary w-full sm:w-auto px-7 py-3.5 rounded-xl text-[14px]">
              {t('landing.hero.alreadyHaveAccount')}
            </button>
          </motion.div>

        </div>
      </section>

      {/* ── STATS ─── */}
      <section style={{ borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-10 grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-0 md:divide-x divide-border">
          {STATS.map(({ value, label, sub }) => (
            <div key={label} className="text-center md:px-8">
              <p className="font-mono font-black text-[34px] md:text-[38px] leading-none text-gradient">{value}</p>
              <p className="text-[13px] font-semibold mt-2">{label}</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-dim)' }}>{sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── PROBLEM ─── */}
      <section className="max-w-6xl mx-auto px-4 md:px-8 py-20 md:py-28">
        <div className="max-w-2xl">
          <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-danger)' }}>{t('landing.problem.badge')}</span>
          <h2 className="font-display font-bold text-[28px] md:text-[36px] mt-3 leading-tight tracking-tight">
            {t('landing.problem.title')}
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed" style={{ color: 'var(--color-text-dim)' }}>
            {t('landing.problem.desc')}
          </p>
        </div>
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
          {PROBLEM_CASES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-2xl p-6 relative overflow-hidden group transition-all duration-300"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-strong)' }}>
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl"
                style={{ background: 'radial-gradient(circle at 50% 0%, rgba(240,82,82,0.06), transparent 70%)' }} />
              <div className="relative">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5"
                  style={{ background: 'rgba(240,82,82,0.1)', border: '1px solid rgba(240,82,82,0.2)' }}>
                  <Icon size={17} style={{ color: 'var(--color-danger)' }} />
                </div>
                <h3 className="text-[14px] font-semibold mb-2">{title}</h3>
                <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-dim)' }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── RULES ─── */}
      <section style={{ background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-20 md:py-28">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-primary)' }}>{t('landing.rules.badge')}</span>
            <h2 className="font-display font-bold text-[28px] md:text-[36px] mt-3 leading-tight tracking-tight">
              {t('landing.rules.title')}
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed" style={{ color: 'var(--color-text-dim)' }}>
              {t('landing.rules.desc')}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {RULES.map(({ code, icon: Icon, title, desc, color, accent, border }) => (
              <div key={code} className="rounded-2xl p-6 flex flex-col relative overflow-hidden group"
                style={{ background: accent, border: `1px solid ${border}` }}>
                <div className="flex items-start justify-between mb-5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: 'var(--color-bg)', border: `1px solid ${border}` }}>
                    <Icon size={17} style={{ color }} />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-lg"
                    style={{ background: 'var(--color-bg)', border: `1px solid ${border}`, color }}>
                    {code}
                  </span>
                </div>
                <h3 className="text-[15px] font-semibold mb-2">{title}</h3>
                <p className="text-[13px] leading-relaxed flex-1" style={{ color: 'var(--color-text-dim)' }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─── */}
      <section className="max-w-6xl mx-auto px-4 md:px-8 py-20 md:py-28">
        <div className="text-center max-w-xl mx-auto mb-14">
          <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-primary)' }}>{t('landing.how.badge')}</span>
          <h2 className="font-display font-bold text-[28px] md:text-[36px] mt-3 leading-tight tracking-tight">
            {t('landing.how.title')}
          </h2>
        </div>
        <div className="flex flex-col md:grid md:grid-cols-3 gap-5 md:gap-12 relative">
          <div className="hidden md:block absolute top-8 left-[16.66%] right-[16.66%] h-px"
            style={{ background: 'linear-gradient(90deg, transparent, var(--color-border-strong), transparent)' }} />
          {HOW.map(({ n, icon: Icon, title, desc }) => (
            <div key={n}
              className="how-step-card flex flex-row md:flex-col gap-4 md:gap-0 items-start p-4 md:p-0 rounded-2xl md:rounded-none"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border-strong)',
              }}
            >
              <div
                className="relative w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl flex items-center justify-center shrink-0 md:mb-6"
                style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border-strong)' }}
              >
                <Icon size={18} style={{ color: 'var(--color-primary)' }} />
                <span
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center"
                  style={{ background: 'var(--color-primary)', color: '#fff' }}
                >{n}</span>
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <h3 className="text-[15px] md:text-[16px] font-semibold mb-1 md:mb-2">{title}</h3>
                <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-dim)' }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── INTEGRATIONS ─── */}
      <section style={{ background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-16 md:py-20">
          <div className="text-center mb-10">
            <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-dim)' }}>{t('landing.integrations.badge')}</span>
            <h2 className="font-display font-bold text-[22px] md:text-[28px] mt-2">{t('landing.integrations.title')}</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {INTEGRATIONS.map(({ name, desc, icon: Icon }) => (
              <div key={name} className="rounded-2xl p-4 flex flex-col items-center text-center gap-2.5 group transition-all duration-300 hover:-translate-y-1"
                style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border-strong)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border-strong)' }}>
                  <Icon size={16} style={{ color: 'var(--color-primary)' }} />
                </div>
                <p className="text-[12px] font-semibold">{name}</p>
                <p className="text-[10px] leading-tight" style={{ color: 'var(--color-text-dim)' }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─── */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0" style={{ background: 'var(--gradient-cta)' }} />
        <div className="pointer-events-none absolute inset-0 opacity-[0.02]"
          style={{ backgroundImage: 'linear-gradient(var(--color-border) 1px,transparent 1px),linear-gradient(90deg,var(--color-border) 1px,transparent 1px)', backgroundSize: '60px 60px' }} />
        <div className="relative max-w-6xl mx-auto px-4 md:px-8 py-24 md:py-32 text-center">
          <div className="inline-flex items-center gap-2 mb-4 px-3.5 py-1.5 rounded-full"
            style={{ background: 'rgba(16,217,160,0.1)', border: '1px solid rgba(16,217,160,0.2)' }}>
            <CheckCircle2 size={12} style={{ color: 'var(--color-success)' }} />
            <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-success)' }}>
              {t('landing.cta.badge')}
            </span>
          </div>
          <h2 className="font-display font-extrabold text-[32px] md:text-[48px] leading-tight tracking-tight max-w-2xl mx-auto">
            {t('landing.cta.title')}
          </h2>
          <p className="mt-4 text-[15px] max-w-md mx-auto" style={{ color: 'var(--color-text-dim)' }}>
            {t('landing.cta.desc')}
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button onClick={onRegister}
              className="btn-primary w-full sm:w-auto px-8 py-4 rounded-xl text-[14px] font-semibold">
              {t('landing.cta.cta')} <ArrowRight size={15} />
            </button>
            <button onClick={onLogin}
              className="btn-secondary w-full sm:w-auto px-8 py-4 rounded-xl text-[14px]">
              {t('landing.cta.alreadyHaveAccount')}
            </button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ─── */}
      <footer style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(79,124,255,0.1)', border: '1px solid rgba(79,124,255,0.2)' }}>
              <ShieldCheck size={12} style={{ color: 'var(--color-primary)' }} />
            </div>
            <span className="font-display font-bold text-[13px] tracking-wide" style={{ color: 'var(--color-text-dim)' }}>
              Olho <span style={{ color: 'var(--color-primary)' }}>Vivo</span>
            </span>
          </div>
          <p className="font-mono text-[11px]" style={{ color: 'var(--color-text-dim)' }}>
            {t('landing.footer.copyright')}
          </p>
        </div>
      </footer>

    </div>
  );
}
