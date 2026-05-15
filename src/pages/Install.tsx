import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Download, FolderOpen } from 'lucide-react';

const INSTALL_FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-install`;

export default function Install({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [filename, setFilename] = useState('');

  useEffect(() => {
    if (!token || !/^[a-zA-Z0-9-]+$/.test(token)) {
      setError('Link de instalação inválido.');
      return;
    }

    const name = `OlhoVivoSetup_TOKEN_${token}.exe`;
    setFilename(name);

    fetch(`${INSTALL_FN}?token=${encodeURIComponent(token)}`, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '' },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text().catch(() => `Erro ${res.status}`));
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        setDone(true);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro desconhecido'));
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
              className="w-10 h-10 rounded-full mx-auto flex items-center justify-center animate-pulse"
              style={{ background: 'rgba(79,124,255,0.1)' }}
            >
              <Download size={20} style={{ color: 'var(--color-primary)' }} />
            </div>
            <p className="text-text font-bold text-lg">A preparar o download…</p>
            <p className="text-text-dim text-sm">Aguarde alguns segundos.</p>
          </>
        )}

        {done && (
          <>
            <CheckCircle2 size={40} className="mx-auto" style={{ color: 'var(--color-success)' }} />
            <p className="text-text font-bold text-lg">Download concluído!</p>

            {/* Instrução principal — barra de downloads do browser */}
            <div
              className="rounded-xl px-4 py-4 text-left space-y-1"
              style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)' }}
            >
              <p className="text-sm font-bold text-text">
                Clique em <span style={{ color: 'var(--color-success)' }}>"Abrir"</span> na barra de downloads do seu navegador
              </p>
              <p className="text-xs text-text-dim">
                Aparece no canto inferior (Chrome/Edge) ou na parte superior da tela.
              </p>
            </div>

            {/* Fallback — não encontrou na barra */}
            <div
              className="rounded-xl px-4 py-4 text-left space-y-2"
              style={{ background: 'rgba(79,124,255,0.05)', border: '1px solid var(--color-border)' }}
            >
              <div className="flex items-center gap-2">
                <FolderOpen size={14} style={{ color: 'var(--color-primary)' }} />
                <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--color-primary)' }}>
                  Não apareceu? Abra a pasta Downloads
                </p>
              </div>
              <p className="text-[11px] text-text-dim break-all font-mono">
                {filename}
              </p>
              <p className="text-[11px] text-text-dim">
                Dê <strong>duplo clique</strong> nesse arquivo → avance as telas → pronto.
              </p>
            </div>
          </>
        )}

        {error && (
          <>
            <AlertTriangle size={40} className="mx-auto" style={{ color: 'var(--color-warning)' }} />
            <p className="text-text font-bold text-lg">Erro ao baixar</p>
            <p className="text-text-dim text-sm">{error}</p>
          </>
        )}
      </div>
    </div>
  );
}
