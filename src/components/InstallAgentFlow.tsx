import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Download, FolderOpen, Copy, Check, MousePointerClick, ChevronDown } from 'lucide-react';
import {
  type AgentOs,
  detectInstallerOs,
  downloadAgentInstaller,
  installerFilename,
  unixInstallCommand,
  postInstallSteps,
} from '../lib/agentInstaller';

const OS_OPTIONS: { id: AgentOs; label: string; icon: string }[] = [
  { id: 'windows', label: 'Windows', icon: '🪟' },
  { id: 'linux', label: 'Linux', icon: '🐧' },
  { id: 'macos', label: 'macOS', icon: '🍎' },
];

interface InstallAgentFlowProps {
  token: string;
  subtitle?: string;
  compact?: boolean;
}

export default function InstallAgentFlow({
  token,
  subtitle = 'Baixe e instale com duplo clique — sem precisar de Terminal',
  compact = false,
}: InstallAgentFlowProps) {
  const [selectedOs, setSelectedOs] = useState<AgentOs | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [done, setDone] = useState(false);
  const [filename, setFilename] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setSelectedOs(detectInstallerOs());
  }, []);

  const runCommand =
    filename && selectedOs ? unixInstallCommand(filename, selectedOs) : '';

  function copyCommand() {
    navigator.clipboard.writeText(runCommand).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function startDownload() {
    if (!selectedOs) return;
    setDownloading(true);
    setError('');
    setFilename(installerFilename(token, selectedOs));

    try {
      await downloadAgentInstaller(token, selectedOs);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setDownloading(false);
    }
  }

  if (error) {
    return (
      <div className="space-y-4 text-center">
        <AlertTriangle size={36} className="mx-auto" style={{ color: 'var(--color-warning)' }} />
        <p className="text-text font-bold">Erro ao baixar</p>
        <p className="text-text-dim text-sm">{error}</p>
        <button
          type="button"
          onClick={() => { setError(''); setDone(false); }}
          className="text-sm font-semibold"
          style={{ color: 'var(--color-primary)' }}
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  if (done && selectedOs) {
    return (
      <div className={compact ? 'space-y-3' : 'space-y-6'}>
        <CheckCircle2
          size={compact ? 32 : 40}
          className="mx-auto"
          style={{ color: 'var(--color-success)' }}
        />
        <p className={`text-text font-bold text-center ${compact ? 'text-base' : 'text-lg'}`}>
          Download concluído!
        </p>
        <p className="text-center text-text-dim text-sm">
          Falta só um passo — sem Terminal, sem comandos.
        </p>

        {selectedOs === 'windows' && (
          <>
            <div
              className="rounded-xl px-4 py-4 text-left space-y-1"
              style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)' }}
            >
              <p className="text-sm font-bold text-text">
                Clique em <span style={{ color: 'var(--color-success)' }}>&quot;Abrir&quot;</span> na barra de downloads
              </p>
              <p className="text-xs text-text-dim">Depois Avançar → Concluir. Pronto.</p>
            </div>
            <FolderHint filename={filename} />
          </>
        )}

        {(selectedOs === 'linux' || selectedOs === 'macos') && (
          <UnixInstallDone
            os={selectedOs}
            runCommand={runCommand}
            copied={copied}
            onCopy={copyCommand}
            filename={filename}
            steps={postInstallSteps(selectedOs)}
          />
        )}
      </div>
    );
  }

  return (
    <div className={compact ? 'space-y-3' : 'space-y-6'}>
      {!compact && (
        <div className="text-center">
          <p className="text-text font-bold text-lg">Instalar Agente Olho Vivo</p>
          <p className="text-text-dim text-sm mt-1">{subtitle}</p>
        </div>
      )}
      {compact && <p className="text-text-dim text-xs">{subtitle}</p>}

      <OsPills selectedOs={selectedOs} onSelect={setSelectedOs} />

      <button
        type="button"
        onClick={startDownload}
        disabled={!selectedOs || downloading}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold transition-opacity"
        style={{
          background: 'var(--color-primary)',
          color: '#fff',
          opacity: !selectedOs || downloading ? 0.45 : 1,
        }}
      >
        {downloading ? (
          <>
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            A preparar…
          </>
        ) : (
          <>
            <Download size={16} />
            Baixar instalador
          </>
        )}
      </button>
    </div>
  );
}

function OsPills({
  selectedOs,
  onSelect,
}: {
  selectedOs: AgentOs | null;
  onSelect: (os: AgentOs) => void;
}) {
  return (
    <div className="flex gap-2">
      {OS_OPTIONS.map((opt) => {
        const active = selectedOs === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelect(opt.id)}
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
  );
}

function UnixInstallDone({
  runCommand,
  copied,
  onCopy,
  filename,
  steps,
  os,
}: {
  os: AgentOs;
  runCommand: string;
  copied: boolean;
  onCopy: () => void;
  filename: string;
  steps: string[];
}) {
  const friendlyName = filename.replace(/\.(sh|command)$/, '');
  return (
    <>
      <div
        className="rounded-xl px-4 py-4 text-left space-y-3"
        style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)' }}
      >
        <div className="flex items-start gap-3">
          <MousePointerClick size={22} className="shrink-0 mt-0.5" style={{ color: 'var(--color-success)' }} />
          <div className="space-y-1">
            <p className="text-sm font-bold text-text">
              Na pasta <span style={{ color: 'var(--color-success)' }}>Downloads</span>, clique duas vezes em:
            </p>
            <p className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
              {friendlyName}
            </p>
            {os === 'linux' && (
              <p className="text-xs text-text-dim">
                Se aparecer uma pergunta, escolha <strong>Executar</strong> ou{' '}
                <strong>Executar no Terminal</strong>.
              </p>
            )}
            {os === 'macos' && (
              <p className="text-xs text-text-dim">
                Se o Mac avisar que o arquivo veio da internet, toque em <strong>Abrir</strong>.
              </p>
            )}
          </div>
        </div>
      </div>
      <div
        className="rounded-xl px-4 py-3 text-left space-y-2"
        style={{ background: 'rgba(79,124,255,0.05)', border: '1px solid var(--color-border)' }}
      >
        <p className="text-[11px] font-bold text-text-dim uppercase tracking-widest">Próximos passos</p>
        {steps.map((step, i) => (
          <p key={step} className="text-xs text-text-dim flex items-start gap-2">
            <span
              className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
              style={{ background: 'rgba(79,124,255,0.15)', color: 'var(--color-primary)' }}
            >
              {i + 1}
            </span>
            {step}
          </p>
        ))}
      </div>
      <FolderHint filename={filename} />
      <details
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--color-border)' }}
      >
        <summary className="px-4 py-2.5 text-xs text-text-dim cursor-pointer flex items-center gap-1 list-none [&::-webkit-details-marker]:hidden">
          <ChevronDown size={14} />
          Só se não abrir com duplo clique (suporte técnico)
        </summary>
        <div className="px-4 pb-3 space-y-2">
          <p className="text-[11px] text-text-dim">
            Abra o Terminal, cole o comando abaixo e pressione Enter:
          </p>
          <div className="flex items-center gap-2">
            <code
              className="flex-1 text-[11px] break-all font-mono px-3 py-2 rounded-lg"
              style={{ background: 'rgba(0,0,0,0.25)', color: 'var(--color-text)' }}
            >
              {runCommand}
            </code>
            <button
              type="button"
              onClick={onCopy}
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg"
              style={{ background: 'rgba(79,124,255,0.12)', color: 'var(--color-primary)' }}
              title="Copiar comando"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      </details>
    </>
  );
}

function FolderHint({ filename }: { filename: string }) {
  return (
    <div
      className="rounded-xl px-4 py-3 text-left space-y-1"
      style={{ background: 'rgba(79,124,255,0.05)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex items-center gap-2">
        <FolderOpen size={14} style={{ color: 'var(--color-primary)' }} />
        <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--color-primary)' }}>
          Arquivo em Downloads
        </p>
      </div>
      <p className="text-[11px] text-text-dim break-all font-mono">{filename}</p>
    </div>
  );
}
