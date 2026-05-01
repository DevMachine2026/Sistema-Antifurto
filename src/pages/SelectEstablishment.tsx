import { Building2, LogOut } from 'lucide-react';

interface EstablishmentOption {
  id: string;
  name: string;
}

interface SelectEstablishmentProps {
  items: EstablishmentOption[];
  onSelect: (establishmentId: string) => void;
  onLogout?: () => void;
}

export default function SelectEstablishment({ items, onSelect, onLogout }: SelectEstablishmentProps) {
  return (
    <div className="min-h-screen bg-bg flex flex-col text-text">
      {/* Header mobile/desktop */}
      <header className="bg-surface border-b border-border px-4 md:px-8 h-14 flex items-center justify-between sticky top-0 z-10">
        <span className="font-black text-[12px] tracking-[0.08em] uppercase">
          <span className="font-display font-bold text-[14px] tracking-wide">
            Olho <span className="text-primary">Vivo</span>
          </span>
        </span>
        {onLogout && (
          <button
            onClick={onLogout}
            className="flex items-center gap-2 px-3 py-2 bg-surface-alt border border-border text-text-dim text-[10px] font-black uppercase tracking-widest rounded hover:bg-danger/10 hover:border-danger/20 hover:text-danger transition-all"
          >
            <LogOut size={12} />
            Sair
          </button>
        )}
      </header>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-text tracking-tight">Selecionar Estabelecimento</h1>
            <p className="text-text-dim text-sm mt-1">Escolha qual comércio você quer gerenciar agora.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => onSelect(item.id)}
                className="w-full text-left bg-surface border border-border rounded-lg p-5 hover:border-primary/40 hover:bg-surface-alt/30 transition-all group"
              >
                <div className="flex items-center gap-2 text-primary mb-2">
                  <Building2 size={16} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Estabelecimento</span>
                </div>
                <div className="text-text font-semibold text-[15px] group-hover:text-primary transition-colors">
                  {item.name}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
