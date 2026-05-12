import { supabase } from './supabase';

const DOWNLOAD_FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/download-agent`;

function assertSafeToken(token: string): string {
  const t = token.trim();
  if (!t || t.length > 200 || !/^[a-zA-Z0-9-]+$/.test(t)) {
    throw new Error('Token inválido para download.');
  }
  return t;
}

/**
 * Baixa o instalador Windows via Edge Function (GitHub em servidor + JWT).
 * Nome sugerido: OlhoVivoSetup_TOKEN_<token>.exe (compatível com Inno Setup).
 */
export async function downloadAgentInstaller(token: string): Promise<void> {
  const safe = assertSafeToken(token);
  const { data: { session } } = await supabase.auth.getSession();
  const jwt = session?.access_token;
  if (!jwt) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  const res = await fetch(
    `${DOWNLOAD_FN}?token=${encodeURIComponent(safe)}`,
    { headers: { Authorization: `Bearer ${jwt}` } },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Erro ${res.status}`);
  }

  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `OlhoVivoSetup_TOKEN_${safe}.exe`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}
