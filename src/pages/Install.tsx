import { useState } from 'react';
import { CheckCircle2, AlertTriangle, Download, FolderOpen, Copy, Check } from 'lucide-react';

const INSTALL_FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-install`;

type OS = 'windows' | 'linux' | 'macos';

interface OsOption {
  id: OS;
  label: string;
  icon: string;
}

const OS_OPTIONS: OsOption[] = [
  { id: 'windows', label: 'Windows', icon: '🪟' },
  { id: 'linux',   label: 'Linux',   icon: '🐧' },
  { id: 'macos',   label: 'macOS',   icon: '🍎' },
];

export default function Install({ token }: { token: string }) {
  const [selectedOs, setSelectedOs] = useState<OS | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [done, setDone] = useState(false);
  const [filename, setFilename] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const isUnix = selectedOs === 'linux' || selectedOs === 'macos';
  const ext = isUnix ? 'sh' : 'exe';
  const runCommand = filename ? `bash ~/Downloads/${filename}` : '';

  function copyCommand() {
    navigator.clipboard.writeText(runCommand).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function startDownload() {
    if (!selectedOs) return;
    if (!token || !/^[a-zA-Z0-9-]+$/.test(token)) {
      setError('Link de instalação inválido.');
      return;
    }

    setDownloading(true);
    setError('');
    const name = `OlhoVivoSetup_TOKEN_${token}.${ext}`;
    setFilename(name);

    try {
      const res = await fetch(
        `${INSTALL_FN}?token=${encodeURIComponent(token)}&os=${selectedOs}`,
        { headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '' } },
      );
      if (!res.ok) throw new Error(await res.text().catch(() => `Erro ${res.status}`));
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--color-bg)' }}>
      <div
        className="w-full max-w-sm rounded-2xl p-8 space-y-6"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <img src="/logo.svg" alt="Olho Vivo" className="h-10 mx-auto" />

        {/* ── Error ── */}
        {error && (
          <>
            <AlertTriangle size={40} className="mx-auto" style={{ color: 'var(--color-warning)' }} />
            <p className="text-text font-bold text-lg text-center">Erro ao baixar</p>
            <p className="text-text-dim text-sm text-center">{error}</p>
          </>
        )}

        {/* ── Seletor de OS + botão download ── */}
        {!done && !error && (
          <>
            <div className="text-center">
              <p className="text-text font-bold text-lg">Instalar Agente Olho Vivo</p>
              <p className="text-text-dim text-sm mt-1">Escolha o sistema operacional do PC do estabelecimento</p>
            </div>

            {/* OS pills */}
            <div className="flex gap-2">
              {OS_OPTIONS.map((opt) => {
                const active = selectedOs === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setSelectedOs(opt.id)}
                    className="flex-1 flex flex-col items-center gap-1 py-3 rounded-xl transition-all"
                    style={{
                      border: `2px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      background: active ? 'rgba(79,124,255,0.08)' : 'transparent',
                      color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
                    }}
                  >
                    <span className="text-xl">{opt.icon}</span>
                    <span className="text-[11px] font-semibold">{opt.label}</span>
                  </button>
                );
              })}
            </div>

            <button
              onClick={startDownload}
              disabled={!selectedOs || downloading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold transition-opacity"
              style={{
                background: 'var(--color-primary)',
                color: '#fff',
                opacity: !selectedOs || downloading ? 0.45 : 1,
              }}
            >
              {downloading
                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> A preparar…</>
                : <><Download size={16} /> Baixar instalador</>}
            </button>
          </>
        )}

        {/* ── Download concluído ── */}
        {done && !error && (
          <>
            <CheckCircle2 size={40} className="mx-auto" style={{ color: 'var(--color-success)' }} />
            <p className="text-text font-bold text-lg text-center">Download concluído!</p>

            {/* Windows */}
            {selectedOs === 'windows' && (
              <>
                <div
                  className="rounded-xl px-4 py-4 text-left space-y-1"
                  style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)' }}
                >
                  <p className="text-sm font-bold text-text">
                    Clique em <span style={{ color: 'var(--color-success)' }}>"Abrir"</span> na barra de downloads do navegador
                  </p>
                  <p className="text-xs text-text-dim">Aparece no canto inferior (Chrome/Edge) ou na parte superior da tela.</p>
                </div>
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
                  <p className="text-[11px] text-text-dim break-all font-mono">{filename}</p>
                  <p className="text-[11px] text-text-dim">
                    Dê <strong>duplo clique</strong> nesse arquivo → avance as telas → pronto.
                  </p>
                </div>
              </>
            )}

            {/* Linux / macOS */}
            {isUnix && (
              <>
                <div
                  className="rounded-xl px-4 py-4 text-left space-y-2"
                  style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)' }}
                >
                  <p className="text-sm font-bold text-text">
                    Abra o <span style={{ color: 'var(--color-success)' }}>Terminal</span> e execute:
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <code
                      className="flex-1 text-[11px] break-all font-mono px-3 py-2 rounded-lg"
                      style={{ background: 'rgba(0,0,0,0.25)', color: 'var(--color-text)' }}
                    >
                      {runCommand}
                    </code>
                    <button
                      onClick={copyCommand}
                      className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                      style={{ background: 'rgba(79,124,255,0.12)', color: 'var(--color-primary)' }}
                      title="Copiar comando"
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>

                <div
                  className="rounded-xl px-4 py-3 text-left space-y-1"
                  style={{ background: 'rgba(79,124,255,0.05)', border: '1px solid var(--color-border)' }}
                >
                  <p className="text-[11px] font-bold text-text-dim uppercase tracking-widest">O script vai:</p>
                  {[
                    'Baixar o agente do GitHub',
                    'Instalar em ~/. local/share/olhovivo-agent',
                    selectedOs === 'linux'
                      ? 'Criar serviço systemd (inicia com o login)'
                      : 'Criar LaunchAgent (inicia com o login)',
                  ].map((step, i) => (
                    <p key={i} className="text-[11px] text-text-dim flex items-start gap-1">
                      <span style={{ color: 'var(--color-success)' }}>✓</span> {step}
                    </p>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
