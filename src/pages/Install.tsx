import { useEffect, useState } from 'react';
import JSZip from 'jszip';
import { Loader2, CheckCircle2, AlertTriangle, Download } from 'lucide-react';

const AGENT_DOWNLOAD_URL = '/agent-download';

type Status = 'downloading' | 'done' | 'error';

export default function Install({ token }: { token: string }) {
  const [status, setStatus] = useState<Status>('downloading');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function run() {
      try {
        const res = await fetch(AGENT_DOWNLOAD_URL);
        if (!res.ok) throw new Error('Arquivo não encontrado. Tente novamente em alguns minutos.');
        const buf = await res.arrayBuffer();
        if (cancelled) return;

        const zip = await JSZip.loadAsync(buf);
        zip.file('olhovivo-agent/token.txt', token);

        const blob = await zip.generateAsync({
          type: 'blob',
          compression: 'DEFLATE',
          compressionOptions: { level: 1 },
        });
        if (cancelled) return;

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'olhovivo-agent.zip';
        a.click();
        URL.revokeObjectURL(url);
        setStatus('done');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro desconhecido');
        setStatus('error');
      }
    }

    run();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full max-w-sm rounded-2xl p-8 text-center space-y-5"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>

        <img src="/logo.svg" alt="Olho Vivo" className="h-10 mx-auto" />

        {status === 'downloading' && (
          <>
            <Loader2 size={40} className="animate-spin mx-auto" style={{ color: 'var(--color-primary)' }} />
            <p className="text-text font-bold text-lg">Preparando instalação…</p>
            <p className="text-text-dim text-sm">O download vai iniciar automaticamente.</p>
          </>
        )}

        {status === 'done' && (
          <>
            <CheckCircle2 size={40} className="mx-auto" style={{ color: 'var(--color-success)' }} />
            <p className="text-text font-bold text-lg">Download concluído!</p>
            <div className="rounded-xl px-4 py-4 space-y-3 text-left"
              style={{ background: 'rgba(79,124,255,0.06)', border: '1px solid rgba(79,124,255,0.15)' }}>
              <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--color-primary)' }}>
                O que fazer agora
              </p>
              {[
                'Abra a pasta Downloads',
                'Clique com botão direito em olhovivo-agent.zip → Extrair tudo',
                'Abra a pasta extraída',
                'Dê duplo clique em olhovivo-agent.exe',
              ].map((s, i) => (
                <div key={s} className="flex items-start gap-2">
                  <span className="text-[10px] font-black rounded px-1.5 py-0.5 shrink-0 mt-0.5"
                    style={{ background: 'rgba(79,124,255,0.2)', color: 'var(--color-primary)' }}>{i + 1}</span>
                  <p className="text-[12px] text-text-dim">{s}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <AlertTriangle size={40} className="mx-auto" style={{ color: 'var(--color-warning)' }} />
            <p className="text-text font-bold text-lg">Erro no download</p>
            <p className="text-text-dim text-sm">{error}</p>
            <button
              onClick={() => { setStatus('downloading'); setError(''); }}
              className="flex items-center gap-2 mx-auto px-4 py-2 rounded-lg text-sm font-bold text-white"
              style={{ background: 'var(--color-primary)' }}
            >
              <Download size={14} /> Tentar novamente
            </button>
          </>
        )}
      </div>
    </div>
  );
}
