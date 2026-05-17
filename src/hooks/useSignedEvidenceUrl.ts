import { useEffect, useState } from 'react';
import { signEvidenceRef } from '../lib/evidenceUrl';

/** Resolve path ou URL legado para signed URL do bucket evidence. */
export function useSignedEvidenceUrl(ref: string | null | undefined): string | null {
  const [signed, setSigned] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSigned(null);

    if (!ref?.trim()) return;

    void signEvidenceRef(ref).then((url) => {
      if (!cancelled) setSigned(url);
    });

    return () => {
      cancelled = true;
    };
  }, [ref]);

  return signed;
}
