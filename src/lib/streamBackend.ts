/**
 * API opcional de streaming HLS / snapshot (servidor Node + MediaMTX na loja).
 * Em produção na Vercel, deixe VITE_API_URL vazio até o backend existir.
 */
export function getStreamBackendUrl(): string | null {
  if (import.meta.env.VITE_STREAM_API_ENABLED === 'false') return null;

  const raw = import.meta.env.VITE_API_URL?.trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    if (!parsed.protocol.startsWith('http')) return null;
    return raw.replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function isStreamBackendConfigured(): boolean {
  return getStreamBackendUrl() != null;
}
