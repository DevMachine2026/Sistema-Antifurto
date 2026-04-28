import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard,
  Upload,
  AlertTriangle,
  BarChart3,
  Settings,
  Menu,
  X,
  BookOpen,
  FlaskConical,
  Plug
} from 'lucide-react';
import { dataService } from '../../services/dataService';
import { cn } from '../../lib/utils';

interface ShellProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function Shell({ children, activeTab, onTabChange }: ShellProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const menuItems = [
    { id: 'dashboard',     label: 'Dashboard',        icon: LayoutDashboard },
    { id: 'upload',        label: 'Importar Dados',   icon: Upload },
    { id: 'alerts',        label: 'Alertas de Fraude',icon: AlertTriangle },
    { id: 'simulator',     label: 'Simulador Demo',   icon: FlaskConical },
    { id: 'integrations',  label: 'Integrações',      icon: Plug },
    { id: 'guide',         label: 'Guia de Operação', icon: BookOpen },
    { id: 'analytics',     label: 'Analítico',        icon: BarChart3 },
    { id: 'settings',      label: 'Configurações',    icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-bg flex flex-col md:flex-row text-text">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex w-56 bg-surface border-r border-border flex-col">
        <div className="p-6 flex items-center gap-2">
          <div className="font-black text-sm tracking-[0.1em] uppercase">
            SISTEMA <span className="text-primary">ANTIFRAUDE</span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-md text-[13px] font-medium transition-all duration-200",
                activeTab === item.id 
                  ? "bg-surface-alt text-white border-l-3 border-primary shadow-[0_0_15px_rgba(59,130,246,0.1)]" 
                  : "text-text-dim hover:bg-surface-alt/50 hover:text-text"
              )}
            >
              <item.icon size={16} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-6 flex flex-col gap-1 text-[10px] text-text-dim mt-auto border-t border-border">
          <p>Versão 1.0 — MVP</p>
          <p>By Dev Machine</p>
        </div>
      </aside>

      {/* Mobile Nav */}
      <div className="md:hidden bg-surface border-b border-border p-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
           <div className="font-black text-sm tracking-[0.05em] uppercase">
              SISTEMA <span className="text-primary">ANTIFRAUDE</span>
            </div>
        </div>
        <button onClick={() => setIsMobileMenuOpen(true)}>
          <Menu size={24} className="text-text" />
        </button>
      </div>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="fixed inset-0 bg-bg z-[60] flex flex-col p-6"
          >
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-2">
                 <div className="font-black text-sm tracking-[0.05em] uppercase">
                    SISTEMA <span className="text-primary">ANTIFRAUDE</span>
                  </div>
              </div>
              <button onClick={() => setIsMobileMenuOpen(false)}>
                <X size={24} />
              </button>
            </div>
            <nav className="space-y-4">
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    onTabChange(item.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-4 py-3 text-lg font-medium",
                    activeTab === item.id ? "text-primary" : "text-text-dim"
                  )}
                >
                  <item.icon size={24} />
                  {item.label}
                </button>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 overflow-auto flex flex-col">
        <header className="hidden md:flex h-20 bg-bg border-b border-border items-center justify-between px-8 sticky top-0 z-10">
          <div>
            <h1 className="text-2xl font-semibold text-text">Monitoramento do Bar</h1>
            <p className="text-text-dim text-[14px]">Operação: Turno Principal - {new Date().toLocaleDateString('pt-br')}</p>
          </div>
          <div className="header-meta text-right flex items-center gap-6">
            <button 
              onClick={async () => {
                await dataService.addPeopleCount({
                  id: crypto.randomUUID(),
                  cameraId: 'cam-entrada',
                  countIn: 10,
                  countOut: 2,
                  peopleInside: 85,
                  recordedAt: new Date().toISOString(),
                });
                alert('Simulação de Alerta R01 disparada! Verifique as notificações e a aba de Alertas.');
              }}
              className="px-4 py-2 bg-danger/10 border border-danger/20 text-danger text-[10px] font-black uppercase tracking-widest rounded hover:bg-danger/20 transition-all"
            >
              Simular Alerta
            </button>
            <div>
              <div className="text-[12px] text-text-dim uppercase tracking-[1px]">Status do Sistema</div>
              <div className="flex items-center gap-2 justify-end">
                <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
                <span className="text-success font-bold text-[13px]">Ativo</span>
              </div>
            </div>
          </div>
        </header>

        <div className="p-4 md:p-6 max-w-7xl w-full mx-auto h-[calc(100vh-4rem)] md:h-auto flex-1">
          {children}
        </div>
      </main>
    </div>
  );
}
