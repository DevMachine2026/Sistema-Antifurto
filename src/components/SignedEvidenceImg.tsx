import { ImgHTMLAttributes } from 'react';
import { useSignedEvidenceUrl } from '../hooks/useSignedEvidenceUrl';

interface SignedEvidenceImgProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  evidenceRef?: string | null;
  placeholderClassName?: string;
}

/** Imagem de evidência com signed URL (bucket privado). */
export function SignedEvidenceImg({
  evidenceRef,
  alt = 'evidência',
  className,
  placeholderClassName,
  ...imgProps
}: SignedEvidenceImgProps) {
  const signedUrl = useSignedEvidenceUrl(evidenceRef);

  if (!evidenceRef?.trim()) return null;

  if (!signedUrl) {
    return (
      <div
        className={placeholderClassName ?? className}
        style={{
          background: 'var(--color-surface-alt)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-hidden
      >
        <span className="w-5 h-5 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
      </div>
    );
  }

  return <img {...imgProps} src={signedUrl} alt={alt} className={className} />;
}
