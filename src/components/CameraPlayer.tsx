import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Hls from 'hls.js';
import { Camera as CameraIcon } from 'lucide-react';
import { Camera } from '../types';
import { getStreamBackendUrl } from '../lib/streamBackend';
import { useSignedEvidenceUrl } from '../hooks/useSignedEvidenceUrl';

type PlayerState = 'loading' | 'hls' | 'snapshot' | 'error' | 'offline' | 'evidence';

interface Props {
  cameraId: string;
  ip?: string;
  status: Camera['status'];
  /** height in px. Pass undefined to fill 100% of the parent. */
  height?: number;
  /** Last evidence frame URL from Supabase Storage — shown when stream is unavailable. */
  lastEvidenceUrl?: string;
  /** ISO timestamp of lastEvidenceUrl, for the badge label. */
  lastEvidenceAt?: string;
}

export function CameraPlayer({ cameraId, ip, status, height, lastEvidenceUrl, lastEvidenceAt }: Props) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const streamBackend = getStreamBackendUrl();
  const signedEvidenceUrl = useSignedEvidenceUrl(lastEvidenceUrl);

  const [playerState, setPlayerState] = useState<PlayerState>(() => {
    if (status !== 'online' || !ip) return 'offline';
    if (!streamBackend) return lastEvidenceUrl ? 'evidence' : 'error';
    return 'loading';
  });
  const [snapshotSrc, setSnapshotSrc] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'online' || !ip) {
      setPlayerState('offline');
      setSnapshotSrc(null);
      return;
    }

    if (!streamBackend) {
      setPlayerState(lastEvidenceUrl ? 'evidence' : 'error');
      setSnapshotSrc(null);
      return;
    }

    let cancelled = false;

    async function initStream() {
      setPlayerState('loading');
      setSnapshotSrc(null);
      try {
        const res = await fetch(`${streamBackend}/api/streams/${cameraId}/hls-url`, {
          signal: AbortSignal.timeout(4_000),
        });
        if (!res.ok) throw new Error('no-hls');
        const data = await res.json() as { hlsUrl: string };
        const url = data.hlsUrl;
        if (cancelled) return;

        const video = videoRef.current;
        if (!video) return;

        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: false,
            xhrSetup: (xhr) => { xhr.withCredentials = true; },
          });
          hlsRef.current = hls;
          hls.loadSource(url);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (!cancelled) {
              setPlayerState('hls');
              video.play().catch(() => {/* autoplay blocked */});
            }
          });
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (data.fatal && !cancelled) fallbackToSnapshot();
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = url;
          video.addEventListener('loadedmetadata', () => {
            if (!cancelled) {
              setPlayerState('hls');
              video.play().catch(() => {});
            }
          }, { once: true });
          video.addEventListener('error', () => { if (!cancelled) fallbackToSnapshot(); }, { once: true });
        } else {
          fallbackToSnapshot();
        }
      } catch {
        if (!cancelled) showNoStream();
      }
    }

    /** Backend inacessível (DNS, rede) — não tenta snapshot para não poluir o console. */
    function showNoStream() {
      setSnapshotSrc(null);
      setPlayerState(lastEvidenceUrl ? 'evidence' : 'error');
    }

    /** HLS falhou mas o backend respondeu — tenta snapshot HTTP. */
    function fallbackToSnapshot() {
      if (lastEvidenceUrl) {
        setSnapshotSrc(null);
        setPlayerState('evidence');
        return;
      }
      setSnapshotSrc(`${streamBackend}/api/cameras/${encodeURIComponent(ip!)}/snapshot`);
      setPlayerState('snapshot');
    }

    void initStream();

    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [cameraId, ip, status, streamBackend, lastEvidenceUrl]);

  const containerStyle: React.CSSProperties = {
    width: '100%',
    height: height ?? '100%',
    background: '#000',
    borderRadius: 'inherit',
    position: 'relative',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const evidenceTime = lastEvidenceAt
    ? new Date(lastEvidenceAt).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      })
    : null;

  function EvidenceFrame({ subtitle }: { subtitle?: string }) {
    if (!lastEvidenceUrl) return null;
    if (!signedEvidenceUrl) {
      return (
        <div style={containerStyle}>
          <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      );
    }
    return (
      <div style={containerStyle}>
        <img
          src={signedEvidenceUrl}
          alt="último frame capturado"
          style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.75 }}
        />
        <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(107,114,128,0.82)', backdropFilter: 'blur(4px)' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-white/60" />
          <span className="text-[10px] font-bold text-white tracking-wide">{t('camera.player.lastFrame').toUpperCase()}</span>
        </div>
        {evidenceTime && (
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[10px] text-white/80 font-mono"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}>
            {evidenceTime}
          </div>
        )}
        {subtitle && (
          <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-medium"
            style={{ background: 'rgba(0,0,0,0.55)', color: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(2px)' }}>
            {subtitle}
          </div>
        )}
      </div>
    );
  }

  if (playerState === 'evidence') {
    return <EvidenceFrame subtitle={t('camera.player.lastCapture')} />;
  }

  if (playerState === 'offline' || playerState === 'error') {
    const onlineNoPreview = status === 'online' && !!ip && !streamBackend;
    const label =
      status !== 'online' || !ip
        ? t('camera.player.offline')
        : onlineNoPreview
          ? t('camera.player.noPreview')
          : t('camera.player.noSignal');
    if (lastEvidenceUrl) {
      return <EvidenceFrame subtitle={t('camera.player.lastCapture')} />;
    }

    return (
      <div style={containerStyle}>
        <div className="flex flex-col items-center gap-2 px-4 text-center">
          <CameraIcon size={28} style={{ color: 'var(--color-text-muted)', opacity: 0.5 }} />
          <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
          {onlineNoPreview && (
            <span className="text-[10px]" style={{ color: 'var(--color-text-dim)' }}>
              {t('camera.player.noPreviewHint')}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {playerState === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        </div>
      )}

      <video
        ref={videoRef}
        muted
        playsInline
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: playerState === 'hls' || playerState === 'loading' ? 'block' : 'none',
        }}
      />

      {playerState === 'snapshot' && snapshotSrc && (
        <img
          src={snapshotSrc}
          alt="snapshot"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => {
            setSnapshotSrc(null);
            setPlayerState(lastEvidenceUrl ? 'evidence' : 'error');
          }}
        />
      )}

      {playerState === 'hls' && (
        <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(220,38,38,0.85)', backdropFilter: 'blur(4px)' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          <span className="text-[10px] font-bold text-white tracking-wide">{t('camera.player.live').toUpperCase()}</span>
        </div>
      )}

      {playerState === 'snapshot' && (
        <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(217,119,6,0.85)', backdropFilter: 'blur(4px)' }}>
          <span className="text-[10px] font-bold text-white tracking-wide">{t('camera.player.snapshot').toUpperCase()}</span>
        </div>
      )}
    </div>
  );
}
