import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Camera as CameraIcon } from 'lucide-react';
import { Camera } from '../types';

const BACKEND = 'http://localhost:3456';

type PlayerState = 'loading' | 'hls' | 'snapshot' | 'error' | 'offline';

interface Props {
  cameraId: string;
  ip?: string;
  status: Camera['status'];
  /** height in px. Pass undefined to fill 100% of the parent. */
  height?: number;
}

export function CameraPlayer({ cameraId, ip, status, height }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef   = useRef<Hls | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState>(
    status !== 'online' || !ip ? 'offline' : 'loading',
  );
  const [snapshotSrc, setSnapshotSrc] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'online' || !ip) {
      setPlayerState('offline');
      return;
    }

    let cancelled = false;

    async function initStream() {
      setPlayerState('loading');
      try {
        const res = await fetch(`${BACKEND}/api/streams/${cameraId}/hls-url`);
        if (!res.ok) throw new Error('no-hls');
        const { url } = await res.json() as { url: string };
        if (cancelled) return;

        const video = videoRef.current;
        if (!video) return;

        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: false });
          hlsRef.current = hls;
          hls.loadSource(url);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (!cancelled) {
              setPlayerState('hls');
              video.play().catch(() => {/* autoplay blocked — still show video */});
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
        if (!cancelled) fallbackToSnapshot();
      }
    }

    function fallbackToSnapshot() {
      const src = `${BACKEND}/api/cameras/${ip}/snapshot`;
      setSnapshotSrc(src);
      setPlayerState('snapshot');
    }

    void initStream();

    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId, ip, status]);

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

  if (playerState === 'offline') {
    return (
      <div style={containerStyle}>
        <div className="flex flex-col items-center gap-2">
          <CameraIcon size={28} style={{ color: 'var(--color-text-muted)', opacity: 0.5 }} />
          <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
            Câmera offline
          </span>
        </div>
      </div>
    );
  }

  if (playerState === 'error') {
    return (
      <div style={containerStyle}>
        <div className="flex flex-col items-center gap-2">
          <CameraIcon size={28} style={{ color: 'var(--color-text-muted)', opacity: 0.4 }} />
          <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
            Sem sinal
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* Loading spinner */}
      {playerState === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        </div>
      )}

      {/* HLS video */}
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

      {/* Snapshot fallback */}
      {playerState === 'snapshot' && snapshotSrc && (
        <img
          src={snapshotSrc}
          alt="snapshot"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setPlayerState('error')}
        />
      )}

      {/* LIVE badge */}
      {playerState === 'hls' && (
        <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(220,38,38,0.85)', backdropFilter: 'blur(4px)' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          <span className="text-[10px] font-bold text-white tracking-wide">AO VIVO</span>
        </div>
      )}

      {/* OFFLINE badge (snapshot mode) */}
      {playerState === 'snapshot' && (
        <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(217,119,6,0.85)', backdropFilter: 'blur(4px)' }}>
          <span className="text-[10px] font-bold text-white tracking-wide">OFFLINE</span>
        </div>
      )}
    </div>
  );
}
