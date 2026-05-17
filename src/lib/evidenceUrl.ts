import { supabase } from './supabase';

const BUCKET = 'evidence';
const SIGNED_TTL_SEC = 3600;

/** Extrai o path no bucket a partir de path relativo ou URL pública/sign antiga. */
export function evidenceStoragePath(ref: string | null | undefined): string | null {
  if (!ref?.trim()) return null;
  const t = ref.trim();
  if (!t.startsWith('http')) return t;

  const markers = [
    '/object/public/evidence/',
    '/object/sign/evidence/',
    '/object/authenticated/evidence/',
  ];
  for (const marker of markers) {
    const i = t.indexOf(marker);
    if (i >= 0) {
      return decodeURIComponent(t.slice(i + marker.length).split('?')[0] ?? '');
    }
  }
  return null;
}

/** Referência unificada: coluna storage_path ou evidence_url legado. */
export function evidenceRef(
  storagePath: string | null | undefined,
  legacyUrl: string | null | undefined,
): string | null {
  return storagePath?.trim() || legacyUrl?.trim() || null;
}

/** URL assinada para exibição no painel (bucket privado + RLS). */
export async function signEvidenceRef(ref: string | null | undefined): Promise<string | null> {
  if (!ref?.trim()) return null;

  const path = evidenceStoragePath(ref);
  if (!path) {
    return ref.startsWith('http') ? ref : null;
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_TTL_SEC);

  if (error || !data?.signedUrl) {
    return ref.startsWith('http') ? ref : null;
  }
  return data.signedUrl;
}

export async function signEvidenceRefs(
  refs: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const unique = [...new Set(refs.filter((r): r is string => !!r?.trim()))];
  const out = new Map<string, string>();
  await Promise.all(
    unique.map(async (ref) => {
      const signed = await signEvidenceRef(ref);
      if (signed) out.set(ref, signed);
    }),
  );
  return out;
}
