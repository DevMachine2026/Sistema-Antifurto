import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Download } from 'lucide-react';

const GITHUB_INSTALLER =
  'https://github.com/DevMachine2026/Sistema-Antifurto/releases/latest/download/OlhoVivoSetup.exe';

export default function Install({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setError('Token inválido.'); return; }

    try {
      const link = document.createElement('a');
      link.href = GITHUB_INSTALLER;
      link.download = `OlhoVivoSetup_TOKEN_${token}.exe`;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    }
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--color-bg)' }}>
      <div
        className="w-full max-w-sm rounded-2xl p-8 text-center space-y-5"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <img src="/logo.svg" alt="Olho Vivo" className="h-10 mx-auto" />

        {!done && !error && (
          <>
            <div
              className="w-10 h-10 rounded-full mx-auto flex items-center justify-center"
              style={{ background: 'rgba(79,124,255,0.1)' }}
            >
              <Download size={20} style={{ color: 'var(--color-primary)' }} />
            </div>
            <p className="text-text font-bold text-lg">A iniciar o download…</p>
          </>
        )}

        {done && (
          <>
            <CheckCircle2 size={40} className="mx-auto" style={{ color: 'var(--color-success)' }} />
            <p className="text-text font-bold text-lg">Instalador descarregado</p>
            <div
              className="rounded-xl px-4 py-4 space-y-3 text-left"
              style={{ background: 'rgba(79,124,255,0.06)', border: '1px solid rgba(79,124,255,0.15)' }}
            >
              <p
                className="text-[11px] font-black uppercase tracking-widest"
                style={{ color: 'var(--color-primary)' }}
              >
                O que fazer agora
              </p>
              {[
                'Abra a pasta de transferências (Downloads)',
                'Faça duplo clique no ficheiro do instalador',
                'Avance nas telas do assistente (Next / Seguinte)',
                'O Olho Vivo inicia sozinho e fica registado para abrir no arranque do Windows',
              ].map((s, i) => (
                <div key={s} className="flex items-start gap-2">
                  <span
                    className="text-[10px] font-black rounded px-1.5 py-0.5 shrink-0 mt-0.5"
                    style={{ background: 'rgba(79,124,255,0.2)', color: 'var(--color-primary)' }}
                  >
                    {i + 1}
                  </span>
                  <p className="text-[12px] text-text-dim">{s}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {error && (
          <>
            <AlertTriangle size={40} className="mx-auto" style={{ color: 'var(--color-warning)' }} />
            <p className="text-text font-bold text-lg">Erro</p>
            <p className="text-text-dim text-sm">{error}</p>
          </>
        )}
      </div>
    </div>
  );
}
