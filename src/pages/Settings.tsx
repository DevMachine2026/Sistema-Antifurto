import React from 'react';
import { Settings as SettingsIcon, Bell, Megaphone, Shield, Database } from 'lucide-react';

export default function Settings() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div>
        <h2 className="text-2xl font-bold text-text uppercase tracking-tight">Preferências_App</h2>
        <p className="text-text-dim text-sm font-medium">Gerencie os limites do motor de regras e parâmetros de auditoria.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ConfigCard 
          icon={Shield} 
          title="Thresholds de Alerta" 
          description="Ajuste o valor mínimo para disparar alertas de gap financeiro (Regra R02)."
          action="R$ 200,00"
        />
        <ConfigCard 
          icon={Bell} 
          title="Central WhatsApp" 
          description="Números configurados para recebimento de logs críticos via API."
          action="3 Ativos"
        />
        <ConfigCard 
          icon={Database} 
          title="Hotsync Hardware" 
          description="Status da ponte RTMP com câmeras inteligentes de contagem."
          action="1 Online"
        />
        <ConfigCard 
          icon={Megaphone} 
          title="Janela de Monitoramento" 
          description="Intervalo de tempo onde as regras serão aplicadas com prioridade."
          action="Noturno"
        />
      </div>

      <div className="bg-surface p-6 rounded-lg border border-warning/30 flex gap-5">
        <div className="w-12 h-12 bg-warning text-white rounded flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
          <SettingsIcon size={24} />
        </div>
        <div className="flex-1">
          <h4 className="font-bold text-text uppercase text-sm tracking-tight">Modo Auditoria_Estrita [v1.2]</h4>
          <p className="text-xs text-text-dim mt-2 leading-relaxed font-medium">
            O modo estrito aumenta a sensibilidade das regras de cross-data. Recomendado para operações com alta densidade de público (acima de 500 pessoas simultâneas).
          </p>
          <button className="mt-4 px-5 py-2 bg-warning text-white rounded font-black text-[10px] uppercase tracking-widest hover:bg-warning/90 transition-colors shadow-lg shadow-warning/10">Ativar Sensibilidade Máxima</button>
        </div>
      </div>

      <div className="mt-8 pt-6 border-t border-border/30 text-center">
        <p className="text-xs text-text-dim font-medium">
          Sistema desenvolvido por <span className="text-primary font-semibold">RonalDigital</span>
        </p>
        <p className="text-[10px] text-text-dim/70 mt-1">Versão 1.0 — MVP</p>
      </div>
    </div>
  );
}

function ConfigCard({ icon: Icon, title, description, action }: any) {
  return (
    <div className="bg-surface p-6 rounded-lg border border-border group hover:border-primary/50 transition-all cursor-pointer shadow-sm">
      <div className="w-10 h-10 bg-surface-alt text-text-dim group-hover:text-primary rounded border border-border flex items-center justify-center mb-4 transition-colors">
        <Icon size={18} />
      </div>
      <h4 className="font-bold text-text uppercase text-[13px] tracking-wide">{title}</h4>
      <p className="text-[12px] text-text-dim mt-2 mb-6 font-medium leading-normal">{description}</p>
      <div className="flex items-center justify-between pt-4 border-t border-border/50">
        <span className="text-[10px] font-mono font-bold text-primary uppercase tracking-widest">{action}</span>
        <button className="text-[10px] uppercase font-black text-text-dim hover:text-text tracking-widest transition-colors">Config</button>
      </div>
    </div>
  );
}
