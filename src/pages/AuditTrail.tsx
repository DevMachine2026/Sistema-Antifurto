import { useEffect, useState } from 'react';
import { History, Loader2, ShieldCheck } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { auditService } from '../services/auditService';
import { AuditEvent } from '../types';

export default function AuditTrail() {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<AuditEvent[]>([]);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await auditService.getRecent(120);
      setEvents(data);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="animate-spin text-text-dim" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-text uppercase tracking-tight">Trilha de Auditoria</h2>
          <p className="text-text-dim text-sm">Registro de ações críticas operacionais por estabelecimento.</p>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-10 text-center">
          <ShieldCheck className="mx-auto text-success mb-3" size={28} />
          <p className="text-text font-bold uppercase text-sm">Sem eventos de auditoria</p>
          <p className="text-text-dim text-xs mt-1">Eventos aparecem aqui após resolução de alertas e mudanças críticas.</p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-border text-[10px] uppercase font-black tracking-widest text-text-dim">
            <div className="col-span-3">Quando</div>
            <div className="col-span-3">Evento</div>
            <div className="col-span-2">Ator</div>
            <div className="col-span-2">Alvo</div>
            <div className="col-span-2">Detalhes</div>
          </div>
          {events.map((event) => (
            <div key={event.id} className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-border/60 text-xs items-center">
              <div className="col-span-3 text-text-dim font-mono">
                {format(parseISO(event.createdAt), "dd/MM HH:mm:ss")}
              </div>
              <div className="col-span-3 text-text font-semibold flex items-center gap-2">
                <History size={13} className="text-primary" />
                {event.eventType}
              </div>
              <div className="col-span-2 text-text-dim">{event.actor}</div>
              <div className="col-span-2 text-text-dim font-mono">{event.targetType}</div>
              <div className="col-span-2 text-text-dim truncate font-mono" title={JSON.stringify(event.metadata)}>
                {event.targetId ?? '-'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
