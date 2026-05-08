import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Download } from 'lucide-react';

const GITHUB_ZIP =
  'https://github.com/DevMachine2026/Sistema-Antifurto/releases/latest/download/olhovivo-agent-windows.zip';

export default function Install({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setError('Token inválido.'); return; }

    try {
      // Download 1: zip do GitHub via link direto — sem fetch, sem CORS
      const zipLink = document.createElement('a');
      zipLink.href = GITHUB_ZIP;
      document.body.appendChild(zipLink);
      zipLink.click();
      document.body.removeChild(zipLink);

      // Download 2: token.txt gerado direto no browser via Blob
      setTimeout(() => {
        const blob = new Blob([token], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const tokenLink = document.createElement('a');
        tokenLink.href = url;
        tokenLink.download = 'token.txt';
        document.body.appendChild(tokenLink);
        tokenLink.click();
        document.body.removeChild(tokenLink);
        URL.revokeObjectURL(url);
      }, 800);

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
            <p className="text-text font-bold text-lg">Iniciando downloads…</p>
          </>
        )}

        {done && (
          <>
            <CheckCircle2 size={40} className="mx-auto" style={{ color: 'var(--color-success)' }} />
            <p className="text-text font-bold text-lg">2 arquivos baixados!</p>
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
                'Abra a pasta Downloads',
                'Extraia o olhovivo-agent-windows.zip',
                'Copie o token.txt para dentro da pasta olhovivo-agent',
                'Dê duplo clique em olhovivo-agent.exe',
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
