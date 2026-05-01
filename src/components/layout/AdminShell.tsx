import React, { useState } from 'react';
import { ShieldCheck, BarChart3, LogOut, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AdminShellProps {
  children: React.ReactNode;
  onLogout: () => void;
  ownEstablishmentName?: string;
  onSwitchToMonitoring?: () => void;
}

export default function AdminShell({ children, onLogout, ownEstablishmentName, onSwitchToMonitoring }: AdminShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-bg flex flex-col text-text">
      {/* Header */}
      <header className="bg-surface border-b border-border px-4 md:px-8 h-14 md:h-16 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <ShieldCheck size={14} className="text-primary" />
          </div>
          <span className="font-display font-bold text-[14px] tracking-wide">
            Olho <span className="text-primary">Vivo</span>
          </span>
          <span className="hidden sm:inline ml-2 px-2 py-0.5 bg-primary/10 border border-primary/20 rounded text-[9px] font-black uppercase tracking-widest text-primary">
            Admin
          </span>
        </div>

        {/* Desktop actions */}
        <div className="hidden md:flex items-center gap-3">
          {onSwitchToMonitoring && ownEstablishmentName && (
            <button
              onClick={onSwitchToMonitoring}
              className="flex items-center gap-2 px-3 py-2 bg-surface-alt border border-border text-text text-[10px] font-black uppercase tracking-widest rounded hover:border-primary/40 hover:text-primary transition-all"
            >
              <BarChart3 size={12} />
              {ownEstablishmentName}
            </button>
          )}
          <button
            onClick={onLogout}
            className="flex items-center gap-2 px-4 py-2 bg-surface-alt border border-border text-text text-[10px] font-black uppercase tracking-widest rounded hover:bg-danger/10 hover:border-danger/20 hover:text-danger transition-all"
          >
            <LogOut size={12} />
            Sair
          </button>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 text-text-dim hover:text-text transition-colors"
          onClick={() => setMenuOpen(true)}
          aria-label="Abrir menu"
        >
          <Menu size={22} />
        </button>
      </header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="fixed inset-0 bg-bg z-[60] flex flex-col p-6"
          >
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <ShieldCheck size={14} className="text-primary" />
                </div>
                <span className="font-display font-bold text-[14px] tracking-wide">
                  Olho <span className="text-primary">Vivo</span>
                </span>
              </div>
              <button onClick={() => setMenuOpen(false)} className="p-2 text-text-dim hover:text-text">
                <X size={22} />
              </button>
            </div>

            <div className="flex-1 space-y-2">
              <p className="text-[10px] uppercase font-black tracking-widest text-text-dim px-3 mb-4">Admin Plataforma</p>

              {onSwitchToMonitoring && ownEstablishmentName && (
                <button
                  onClick={() => { setMenuOpen(false); onSwitchToMonitoring(); }}
                  className="w-full flex items-center gap-4 px-3 py-3.5 rounded-lg text-base font-medium text-text hover:bg-surface-alt/50 transition-colors"
                >
                  <BarChart3 size={20} className="text-primary" />
                  {ownEstablishmentName}
                </button>
              )}
            </div>

            <div className="pt-6 border-t border-border">
              <button
                onClick={() => { setMenuOpen(false); onLogout(); }}
                className="w-full flex items-center gap-3 px-3 py-3.5 rounded-lg text-base font-medium text-danger hover:bg-danger/10 transition-colors"
              >
                <LogOut size={20} />
                Sair da conta
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <main className="flex-1 px-4 md:px-10 py-6 md:py-8 w-full">
        {children}
      </main>
    </div>
  );
}
