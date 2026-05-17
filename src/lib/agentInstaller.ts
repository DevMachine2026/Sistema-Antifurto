export type AgentOs = 'windows' | 'linux' | 'macos';

const INSTALL_FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-install`;

export function assertSafeToken(token: string): string {
  const t = token.trim();
  if (!t || t.length > 200 || !/^[a-zA-Z0-9-]+$/.test(t)) {
    throw new Error('Token inválido para download.');
  }
  return t;
}

/** Detecta o SO do navegador (para pré-selecionar no instalador). */
export function detectInstallerOs(): AgentOs {
  if (typeof navigator === 'undefined') return 'windows';
  const ua = navigator.userAgent.toLowerCase();
  const platform = (navigator.platform ?? '').toLowerCase();
  if (ua.includes('win') || platform.includes('win')) return 'windows';
  if (ua.includes('mac') || platform.includes('mac')) return 'macos';
  if (ua.includes('linux') || platform.includes('linux')) return 'linux';
  return 'windows';
}

export function installerExtension(os: AgentOs): 'exe' | 'sh' | 'command' {
  if (os === 'windows') return 'exe';
  if (os === 'macos') return 'command';
  return 'sh';
}

/** Nome amigável para o cliente (token vai no .olhovivo.env, não no nome do arquivo). */
export function installerFilename(_token: string, os: AgentOs): string {
  if (os === 'windows') {
    return `OlhoVivoSetup_TOKEN_${assertSafeToken(_token)}.exe`;
  }
  if (os === 'macos') return 'Instalar-Olho-Vivo.command';
  return 'Instalar-Olho-Vivo.sh';
}

export function installerDisplayName(filename: string): string {
  return filename.replace(/_/g, ' ').replace('.command', '').replace('.sh', '');
}

export function unixInstallCommand(filename: string, os: AgentOs = 'linux'): string {
  if (os === 'macos') {
    return `bash ~/Downloads/${filename}`;
  }
  return `bash ~/Downloads/${filename}`;
}

export function osLabel(os: AgentOs): string {
  if (os === 'windows') return 'Windows';
  if (os === 'macos') return 'macOS';
  return 'Linux';
}

/** Passos exibidos após o download (linguagem para o cliente leigo). */
export function postInstallSteps(os: AgentOs): string[] {
  if (os === 'windows') {
    return [
      'Duplo clique no arquivo .exe em Downloads',
      'Avançar → Concluir no assistente',
      'O agente inicia sozinho ao ligar o PC',
    ];
  }
  if (os === 'macos') {
    return [
      'Abra a pasta Downloads',
      'Clique duas vezes em Instalar-Olho-Vivo',
      'Aguarde "Instalação concluída" e feche a janela',
    ];
  }
  return [
    'Abra a pasta Downloads',
    'Clique duas vezes em Instalar-Olho-Vivo',
    'Aguarde "Instalação concluída" — o agente inicia sozinho',
  ];
}

export interface DownloadInstallerResult {
  os: AgentOs;
  filename: string;
  runCommand: string | null;
}

/**
 * Baixa o instalador correto via agent-install (Windows / Linux / macOS).
 * Usa apikey anon — mesmo endpoint da página /install/:token.
 */
export async function downloadAgentInstaller(
  token: string,
  os: AgentOs = detectInstallerOs(),
): Promise<DownloadInstallerResult> {
  const safe = assertSafeToken(token);
  const filename = installerFilename(safe, os);

  const res = await fetch(
    `${INSTALL_FN}?token=${encodeURIComponent(safe)}&os=${os}`,
    { headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '' } },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Erro ${res.status} ao baixar instalador`);
  }

  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);

  return {
    os,
    filename,
    runCommand: os === 'windows' ? null : unixInstallCommand(filename, os),
  };
}

export function installPageUrl(token: string): string {
  const safe = assertSafeToken(token);
  if (typeof window === 'undefined') return `/install/${safe}`;
  return `${window.location.origin}/install/${safe}`;
}
