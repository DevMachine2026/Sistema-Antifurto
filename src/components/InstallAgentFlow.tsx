import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Download, FolderOpen, Copy, Check } from 'lucide-react';
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
  subtitle = 'Windows, Linux ou macOS — já selecionamos o sistema deste computador',
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
                  type="button"
                  onClick={copyCommand}
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg"
                  style={{ background: 'rgba(79,124,255,0.12)', color: 'var(--color-primary)' }}
                  title="Copiar comando"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
            <FolderHint filename={filename} />
          </>
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
  terminalHint,
}: {
  runCommand: string;
  copied: boolean;
  onCopy: () => void;
  filename: string;
  steps: string[];
  terminalHint?: string;
}) {
  return (
    <>
      <div
        className="rounded-xl px-4 py-4 text-left space-y-2"
        style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)' }}
      >
        <p className="text-sm font-bold text-text">
          Abra o <span style={{ color: 'var(--color-success)' }}>Terminal</span> e execute:
        </p>
        {terminalHint && (
          <p className="text-xs text-text-dim">{terminalHint}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
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
        </motionless>
      </motionless>
      <div
        className="rounded-xl px-4 py-3 text-left space-y-2"
        style={{ background: 'rgba(79,124,255,0.05)', border: '1px solid var(--color-border)' }}
      >
        <p className="text-[11px] font-bold text-text-dim uppercase tracking-widest">O script vai:</p>
        {steps.map((step) => (
          <p key={step} className="text-[11px] text-text-dim flex items-start gap-1">
            <span style={{ color: 'var(--color-success)' }}>✓</span> {step}
          </p>
        ))}
      </motionless>
      <FolderHint filename={filename} />
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
