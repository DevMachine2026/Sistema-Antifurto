import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard, Upload, AlertTriangle, BarChart3, Settings,
  Menu, X, BookOpen, FlaskConical, Plug, ClipboardList,
  ShieldCheck, LogOut, ChevronLeft,
} from 'lucide-react';
import { dataService } from '../../services/dataService';
import { cn } from '../../lib/utils';

interface ShellProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout: () => void;
  establishmentName?: string;
  onBackToAdmin?: () => void;
}

const menuItems = [
  { id: 'dashboard',    label: 'Dashboard',        icon: LayoutDashboard },
  { id: 'upload',       label: 'Importar Dados',   icon: Upload },
  { id: 'alerts',       label: 'Alertas de Fraude',icon: AlertTriangle },
  { id: 'simulator',    label: 'Simulador Demo',   icon: FlaskConical },
  { id: 'integrations', label: 'Integrações',      icon: Plug },
  { id: 'audit',        label: 'Trilha Auditoria', icon: ClipboardList },
  { id: 'guide',        label: 'Guia de Operação', icon: BookOpen },
  { id: 'analytics',    label: 'Analítico',        icon: BarChart3 },
  { id: 'settings',     label: 'Configurações',    icon: Settings },
];

function NavItem({ item, active, onClick }: {
  item: typeof menuItems[0];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 relative group',
        active
          ? 'text-white'
          : 'text-text-dim hover:text-text'
      )}
    >
      {active && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-xl"
          style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border-strong)' }}
          transition={{ type: 'spring', stiffness: 400, damping: 35 }}
        />
      )}
      {!active && (
        <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: 'var(--color-surface-alt)' }} />
      )}
      <span className="relative flex items-center gap-3">
        <item.icon size={15} className={active ? 'text-primary' : ''} />
        {item.label}
      </span>
      {active && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-r-full"
          style={{ background: 'var(--color-primary)' }} />
      )}
    </button>
  );
}

export default function Shell({
  children, activeTab, onTabChange, onLogout, establishmentName, onBackToAdmin,
}: ShellProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleSimulateAlert = async () => {
    await Promise.all([
      dataService.addPeopleCount({
        id: crypto.randomUUID(), cameraId: 'cam-area-01',
        countIn: 60, countOut: 5, peopleInside: 55,
        recordedAt: new Date().toISOString(),
      }),
      dataService.addPeopleCount({
        id: crypto.randomUUID(), cameraId: 'cam-area-02',
        countIn: 40, countOut: 3, peopleInside: 37,
        recordedAt: new Date().toISOString(),
      }),
    ]);
    alert('Simulação de Alerta R01 disparada! Verifique a aba Alertas.');
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row" style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}>

      {/* ── Sidebar Desktop ── */}
      <aside className="hidden md:flex w-60 flex-col flex-shrink-0 sticky top-0 h-screen"
        style={{ background: 'var(--color-surface)', borderRight: '1px solid var(--color-border)' }}>

        {/* Identidade do estabelecimento */}
        <div className="px-4 py-4"
          style={{ borderBottom: '1px solid var(--color-border)' }}>
          {/* Platform badge — mínimo */}
          <div className="flex items-center gap-1.5 mb-3">
            <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
              style={{ background: 'rgba(79,124,255,0.12)', border: '1px solid rgba(79,124,255,0.2)' }}>
              <ShieldCheck size={11} style={{ color: 'var(--color-primary)' }} />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest"
              style={{ color: 'var(--color-text-muted)' }}>Olho Vivo</span>
          </div>
          {/* Nome do estabelecimento — em destaque */}
          <div className="px-3 py-2.5 rounded-xl"
            style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border-strong)' }}>
            <p className="text-[11px] font-bold uppercase tracking-widest mb-0.5"
              style={{ color: 'var(--color-primary)' }}>Comércio</p>
            <p className="text-[14px] font-semibold text-text leading-tight truncate">
              {establishmentName ?? 'Meu Negócio'}
            </p>
            <div className="flex items-center gap-1.5 mt-1.5">
              <div className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: 'var(--color-success)' }} />
              <span className="text-[10px] font-medium" style={{ color: 'var(--color-success)' }}>Sistema ativo</span>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {menuItems.map((item) => (
            <NavItem
              key={item.id}
              item={item}
              active={activeTab === item.id}
              onClick={() => onTabChange(item.id)}
            />
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 space-y-1" style={{ borderTop: '1px solid var(--color-border)' }}>
          {onBackToAdmin && (
            <button
              onClick={onBackToAdmin}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[12px] font-medium transition-all duration-200 hover:bg-surface-alt"
              style={{ color: 'var(--color-primary)' }}>
              <ChevronLeft size={14} />
              Painel Admin
            </button>
          )}
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[12px] font-medium transition-all duration-200"
            style={{ color: 'var(--color-text-dim)' }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.color = 'var(--color-danger)';
              (e.currentTarget as HTMLElement).style.background = 'rgba(240,82,82,0.06)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.color = 'var(--color-text-dim)';
              (e.currentTarget as HTMLElement).style.background = 'transparent';
            }}>
            <LogOut size={14} />
            Sair da conta
          </button>
          {/* Atribuição discreta da plataforma */}
          <div className="flex items-center gap-1.5 px-3 pt-2">
            <ShieldCheck size={10} style={{ color: 'var(--color-text-muted)' }} />
            <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
              Olho Vivo · v1.0 · Dev Machine
            </p>
          </div>
        </div>
      </aside>

      {/* ── Mobile Header ── */}
      <header className="md:hidden sticky top-0 z-50 flex items-center justify-between px-4 h-14 gap-2"
        style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>
        {/* Nome do comércio como identidade principal */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'rgba(79,124,255,0.12)', border: '1px solid rgba(79,124,255,0.25)' }}>
            <ShieldCheck size={13} style={{ color: 'var(--color-primary)' }} />
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-text truncate leading-tight">
              {establishmentName ?? 'Meu Negócio'}
            </p>
            <p className="text-[10px] font-medium leading-none mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Olho Vivo
            </p>
          </div>
        </div>
        {/* Indicador live + hamburger */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md"
            style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border-strong)' }}>
            <div className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: 'var(--color-success)' }} />
            <span className="text-[10px] font-semibold" style={{ color: 'var(--color-success)' }}>Ativo</span>
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
            style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border-strong)' }}
            aria-label="Abrir menu">
            <Menu size={18} />
          </button>
        </div>
      </header>

      {/* ── Mobile Drawer ── */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 z-[60]"
              style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            />
            <motion.div
              key="drawer"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 350, damping: 35 }}
              className="fixed inset-y-0 left-0 z-[70] w-72 flex flex-col overflow-y-auto"
              style={{ background: 'var(--color-surface)', borderRight: '1px solid var(--color-border-strong)' }}>

              {/* Drawer header: nome do comércio em destaque */}
              <div className="px-5 py-4"
                style={{ borderBottom: '1px solid var(--color-border)' }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck size={11} style={{ color: 'var(--color-text-muted)' }} />
                    <span className="text-[10px] font-bold uppercase tracking-widest"
                      style={{ color: 'var(--color-text-muted)' }}>Olho Vivo</span>
                  </div>
                  <button
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                    style={{ background: 'var(--color-surface-alt)' }}
                    aria-label="Fechar menu">
                    <X size={16} />
                  </button>
                </div>
                {/* Card do estabelecimento */}
                <div className="px-3 py-2.5 rounded-xl"
                  style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border-strong)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5"
                    style={{ color: 'var(--color-primary)' }}>Comércio ativo</p>
                  <p className="text-[15px] font-semibold text-text leading-tight truncate">
                    {establishmentName ?? 'Meu Negócio'}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <div className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: 'var(--color-success)' }} />
                    <span className="text-[10px] font-medium" style={{ color: 'var(--color-success)' }}>Sistema ativo</span>
                  </div>
                </div>
              </div>

              <nav className="flex-1 px-3 py-4 space-y-0.5">
                {menuItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { onTabChange(item.id); setIsMobileMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-[14px] font-medium transition-all duration-200"
                    style={{
                      background: activeTab === item.id ? 'var(--color-surface-2)' : 'transparent',
                      color: activeTab === item.id ? 'var(--color-text)' : 'var(--color-text-dim)',
                      border: activeTab === item.id ? '1px solid var(--color-border-strong)' : '1px solid transparent',
                    }}>
                    <item.icon size={18} style={{ color: activeTab === item.id ? 'var(--color-primary)' : undefined }} />
                    {item.label}
                  </button>
                ))}
              </nav>

              <div className="px-4 pb-6 space-y-1" style={{ borderTop: '1px solid var(--color-border)' }}>
                {onBackToAdmin && (
                  <button
                    onClick={() => { setIsMobileMenuOpen(false); onBackToAdmin(); }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-[14px] font-medium transition-all duration-200 mt-4"
                    style={{ color: 'var(--color-primary)' }}>
                    <ChevronLeft size={18} />
                    Painel Admin
                  </button>
                )}
                <button
                  onClick={() => { setIsMobileMenuOpen(false); onLogout(); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-[14px] font-medium transition-all duration-200"
                  style={{ color: 'var(--color-danger)' }}>
                  <LogOut size={18} />
                  Sair da conta
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col overflow-auto min-h-0">

        {/* Desktop Header */}
        <div className="hidden md:flex h-16 items-center justify-between px-8 sticky top-0 z-10"
          style={{ background: 'rgba(8,8,12,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-4">
            <div>
              <h1 className="font-display font-semibold text-[18px]">
                {establishmentName ?? 'Monitoramento'}
              </h1>
              <p className="text-[12px]" style={{ color: 'var(--color-text-dim)' }}>
                {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
              </p>
            </div>
            {onBackToAdmin && (
              <button onClick={onBackToAdmin}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-all"
                style={{ background: 'rgba(79,124,255,0.1)', border: '1px solid rgba(79,124,255,0.2)', color: 'var(--color-primary)' }}>
                <ShieldCheck size={12} />
                Painel Admin
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Live indicator */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-strong)' }}>
              <div className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: 'var(--color-success)' }} />
              <span className="text-[11px] font-semibold" style={{ color: 'var(--color-success)' }}>Ativo</span>
            </div>

            <button onClick={handleSimulateAlert}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-all"
              style={{ background: 'rgba(240,82,82,0.08)', border: '1px solid rgba(240,82,82,0.2)', color: 'var(--color-danger)' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(240,82,82,0.15)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(240,82,82,0.08)'}>
              Simular R01
            </button>

            <button onClick={onLogout}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-all"
              style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border-strong)', color: 'var(--color-text-dim)' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--color-text)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--color-text-dim)'}>
              Sair
            </button>
          </div>
        </div>

        {/* Page content */}
        <div className="flex-1 p-4 md:p-6 max-w-7xl w-full mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
