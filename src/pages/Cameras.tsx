import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import {
  Camera as CameraIcon, Plus, Clock, Trash2, Edit3,
  Check, X, Loader2, AlertCircle, Copy,
  ArrowLeft, Zap, CheckCircle2, Radio, HelpCircle,
  Wifi, WifiOff, ChevronDown, ChevronRight, Maximize2,
} from 'lucide-react';
import { Camera, CameraBrand, CameraType } from '../types';
import { cameraService } from '../services/cameraService';
import { scanNetwork, detectLocalSubnet, slugify, checkScanCapability, ScanCapability, CameraCandidate, SNAPSHOT_PATHS } from '../services/networkScanner';
import { supabase } from '../lib/supabase';
import { getCurrentEstablishmentId } from '../lib/tenant';
import { cn } from '../lib/utils';
import { CameraPlayer } from '../components/CameraPlayer';

// ── types ────────────────────────────────────────────────────────────────────

interface DiscoveredCamera {
  ip: string;
  port: number;
  brand: string;
  hasRtsp: boolean;
  snapshotUrl?: string;
  onvifProfileToken?: string;
  manufacturer?: string;
  model?: string;
}

const BACKEND = import.meta.env.VITE_API_URL ?? 'http://localhost:3456';

const BACKEND_BRAND_LABELS: Record<string, string> = {
  intelbras: 'Intelbras', hikvision: 'Hikvision', dahua: 'Dahua', generic: 'Genérica',
};

// Tenta carregar snapshot da câmera percorrendo os caminhos conhecidos.
// Usa <img> em modo opaco — funciona na mesma rede local sem CORS.
function SnapshotProbe({ ip, port = 80 }: { ip: string; port?: number }) {
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);

  if (failed || idx >= SNAPSHOT_PATHS.length) {
    return (
      <div className="w-full h-full flex items-center justify-center"
        style={{ background: 'var(--color-surface)' }}>
        <CameraIcon size={20} style={{ color: 'var(--color-text-muted)', opacity: 0.5 }} />
      </div>
    );
  }

  return (
    <img
      src={`http://${ip}:${port}${SNAPSHOT_PATHS[idx]}`}
      alt=""
      className="w-full h-full object-cover"
      onError={() => setIdx((i) => i + 1)}
      onLoad={() => setFailed(false)}
    />
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function statusDot(status: Camera['status']) {
  if (status === 'online')  return <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />;
  if (status === 'offline') return <span className="w-2 h-2 rounded-full bg-red-400  inline-block" />;
  return                           <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />;
}

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function useSettings() {
  const [token, setToken] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  useEffect(() => {
    const eid = getCurrentEstablishmentId();
    if (!eid) return;
    supabase.from('settings').select('webhook_token').eq('establishment_id', eid).single()
      .then(({ data }) => {
        if (!data) return;
        setToken(data.webhook_token ?? '');
        const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') ?? '';
        setWebhookUrl(`${base}/functions/v1/webhook-camera`);
      });
  }, []);
  return { token, webhookUrl };
}

// ── CameraCard ────────────────────────────────────────────────────────────────

function CameraCard({ cam, onDelete }: { cam: Camera; onDelete: () => void }) {
  const { t } = useTranslation();
  const [fullscreen, setFullscreen] = useState(false);
  const [lastEvidence, setLastEvidence] = useState<{ url: string; at: string } | null>(null);

  useEffect(() => {
    supabase
      .from('people_count_events')
      .select('evidence_url, recorded_at')
      .eq('camera_id', cam.cameraId)
      .not('evidence_url', 'is', null)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.evidence_url) {
          setLastEvidence({ url: data.evidence_url as string, at: data.recorded_at as string });
        }
      });
  }, [cam.cameraId]);
  const brandLabel: Record<CameraBrand, string> = {
    intelbras: 'Intelbras', hikvision: 'Hikvision', dahua: 'Dahua', generic: t('cameras.brandGeneric'),
  };
  const typeLabel = cam.cameraType === 'people_counting' ? t('cameras.type.counting') : t('cameras.type.cash');

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-xl overflow-hidden"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>

        {/* Player — 160px mobile / 200px desktop */}
        <div
          className="relative cursor-pointer group h-[160px] md:h-[200px]"
          onClick={() => setFullscreen(true)}>
          <div className="rounded-t-xl overflow-hidden h-full">
            <CameraPlayer
              cameraId={cam.cameraId}
              ip={cam.ip}
              status={cam.status}
              height={undefined}
              lastEvidenceUrl={lastEvidence?.url}
              lastEvidenceAt={lastEvidence?.at}
            />
          </div>
          {/* expand hint on hover */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: 'rgba(0,0,0,0.3)' }}>
            <Maximize2 size={20} className="text-white drop-shadow" />
          </div>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'rgba(79,124,255,0.1)', border: '1px solid rgba(79,124,255,0.2)' }}>
                <CameraIcon size={15} style={{ color: 'var(--color-primary)' }} />
              </div>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-text truncate">{cam.name}</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-dim)' }}>
                  ID: <span className="font-mono">{cam.cameraId}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {statusDot(cam.status)}
              <span className="text-[11px] font-medium" style={{
                color: cam.status === 'online' ? 'var(--color-success)' :
                       cam.status === 'offline' ? 'var(--color-danger)' : 'var(--color-warning)',
              }}>{t(`cameras.status.${cam.status}`)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[12px]">
            {([
              [t('cameras.brand'), brandLabel[cam.brand]],
              [t('cameras.type.label'), typeLabel],
              ...(cam.ip ? [['IP', `${cam.ip}:${cam.port}`]] : []),
              [t('cameras.lastEvent'), fmtDate(cam.lastEventAt)],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label}>
                <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                <p className="font-medium text-text mt-0.5 flex items-center gap-1">
                  {label === t('cameras.lastEvent') && <Clock size={10} />}
                  <span className={label === 'IP' ? 'font-mono' : ''}>{value}</span>
                </p>
              </div>
            ))}
          </div>

          {cam.status === 'pending' && (
            <div className="flex gap-2 p-2.5 rounded-lg text-[11px]"
              style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)', color: 'var(--color-warning)' }}>
              <AlertCircle size={12} className="shrink-0 mt-0.5" />
              <span>{t('cameras.pendingHint')}</span>
            </div>
          )}

          <button onClick={onDelete}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
            style={{ background: 'rgba(240,82,82,0.07)', border: '1px solid rgba(240,82,82,0.15)', color: 'var(--color-danger)' }}>
            <Trash2 size={12} /> {t('cameras.delete')}
          </button>
        </div>
      </motion.div>

      {/* Fullscreen modal */}
      <AnimatePresence>
        {fullscreen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)' }}
            onClick={() => setFullscreen(false)}>
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 30 }}
              className="w-full max-w-3xl rounded-2xl overflow-hidden"
              style={{ background: '#000', border: '1px solid var(--color-border-strong)' }}
              onClick={(e) => e.stopPropagation()}>
              {/* header */}
              <div className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <span className="text-[14px] font-semibold text-white">{cam.name}</span>
                <button onClick={() => setFullscreen(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.1)' }}>
                  <X size={14} className="text-white" />
                </button>
              </div>
              {/* player — fills width, 16:9 */}
              <div style={{ aspectRatio: '16/9', width: '100%' }}>
                <CameraPlayer
                  cameraId={cam.cameraId}
                  ip={cam.ip}
                  status={cam.status}
                  height={undefined}
                  lastEvidenceUrl={lastEvidence?.url}
                  lastEvidenceAt={lastEvidence?.at}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── ConfigInstructions ────────────────────────────────────────────────────────

function ConfigInstructions({ brand, webhookUrl, token, cameraId }: {
  brand: CameraBrand; webhookUrl: string; token: string; cameraId: string;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<string | null>(null);
  const brandLabel: Record<CameraBrand, string> = {
    intelbras: 'Intelbras', hikvision: 'Hikvision', dahua: 'Dahua', generic: t('cameras.brandGeneric'),
  };

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  function CopyRow({ label, value, k }: { label: string; value: string; k: string }) {
    return (
      <div className="rounded-lg p-3 space-y-1" style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}>
        <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-[11px] font-mono truncate text-text">{value}</code>
          <button onClick={() => copy(value, k)}
            className="shrink-0 px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition-colors"
            style={{
              background: copied === k ? 'rgba(16,185,129,0.15)' : 'var(--color-surface-2)',
              color: copied === k ? 'var(--color-success)' : 'var(--color-primary)',
              border: '1px solid var(--color-border-strong)',
            }}>
            {copied === k ? <Check size={11} /> : <Copy size={11} />}
            {copied === k ? t('cameras.copied') : t('cameras.copy')}
          </button>
        </div>
      </div>
    );
  }

  const steps: string[] = brand === 'intelbras' ? [
    t('cameras.cfg.intelbras.1'), t('cameras.cfg.intelbras.2'),
    t('cameras.cfg.intelbras.3', { cameraId }), t('cameras.cfg.intelbras.4'),
  ] : brand === 'dahua' ? [
    t('cameras.cfg.dahua.1'), t('cameras.cfg.dahua.2'),
    t('cameras.cfg.dahua.3', { cameraId }),
  ] : [
    t('cameras.cfg.generic.1'), t('cameras.cfg.generic.2'),
    t('cameras.cfg.generic.3', { cameraId }),
  ];

  return (
    <div className="space-y-3">
      <CopyRow label={t('cameras.cfg.endpoint')} value={webhookUrl} k="url" />
      <CopyRow label={t('cameras.cfg.token')} value={token} k="token" />
      <CopyRow label={t('cameras.cfg.channelId')} value={cameraId} k="id" />
      <div className="space-y-2 pt-1">
        <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
          {t('cameras.cfg.steps', { brand: brandLabel[brand] })}
        </p>
        {steps.map((step, i) => (
          <div key={i} className="flex gap-2.5 items-start">
            <span className="shrink-0 w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center mt-0.5"
              style={{ background: 'rgba(79,124,255,0.12)', color: 'var(--color-primary)' }}>{i + 1}</span>
            <p className="text-[12px]" style={{ color: 'var(--color-text-dim)' }}>{step}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── BRAND DATA ────────────────────────────────────────────────────────────────

const BRANDS: { id: CameraBrand; label: string; color: string; hint: string; appName: string; appSteps: string[] }[] = [
  {
    id: 'intelbras', label: 'Intelbras', color: 'rgba(59,130,246,0.12)',
    hint: 'IntelbrasCAM',
    appName: 'IntelbrasCAM',
    appSteps: [
      'Abra o app IntelbrasCAM no celular',
      'Toque na câmera → "Propriedades"',
      'Veja o campo "Endereço IP"',
    ],
  },
  {
    id: 'hikvision', label: 'Hikvision', color: 'rgba(220,38,38,0.1)',
    hint: 'Hik-Connect',
    appName: 'Hik-Connect',
    appSteps: [
      'Abra o app Hik-Connect no celular',
      'Toque no dispositivo → ícone de engrenagem',
      'Veja "Endereço de rede"',
    ],
  },
  {
    id: 'dahua', label: 'Dahua', color: 'rgba(245,158,11,0.1)',
    hint: 'DMSS',
    appName: 'DMSS',
    appSteps: [
      'Abra o app DMSS no celular',
      'Toque no dispositivo → "Informações"',
      'Veja o campo "Endereço IP"',
    ],
  },
  {
    id: 'generic', label: 'Outra marca', color: 'rgba(107,114,128,0.1)',
    hint: 'Roteador',
    appName: 'Painel do roteador',
    appSteps: [
      'Acesse 192.168.1.1 no browser',
      'Vá em "Dispositivos conectados" ou "DHCP"',
      'Identifique a câmera pelo nome do fabricante',
    ],
  },
];

// ── WIZARD ───────────────────────────────────────────────────────────────────

type WizardStep = 'brand' | 'ip' | 'name' | 'configure' | 'test';

function Wizard({ onClose, onDone }: { onClose: () => void; onDone: (cam: Camera) => void }) {
  const { t } = useTranslation();
  const { token, webhookUrl } = useSettings();

  const [step, setStep]               = useState<WizardStep>('brand');
  const [brand, setBrand]             = useState<CameraBrand | null>(null);
  const [ip, setIp]                   = useState('');
  const [port, setPort]               = useState('80');
  const [showHelp, setShowHelp]       = useState(false);
  const [name, setName]               = useState('');
  const [cameraId, setCameraId]       = useState('');
  const [cameraType, setCameraType]   = useState<CameraType>('people_counting');
  const [saving, setSaving]           = useState(false);
  const [savedCam, setSavedCam]       = useState<Camera | null>(null);
  const [formError, setFormError]     = useState('');
  const [testResult, setTestResult]   = useState<'waiting' | 'ok' | 'timeout' | null>(null);
  const [testing, setTesting]         = useState(false);

  // scan state (optional, on-demand)
  const [showScan, setShowScan]               = useState(false);
  const [scanCapability, setScanCapability]   = useState<ScanCapability | null>(null);
  const [scanning, setScanning]               = useState(false);
  const [scanProgress, setScanProgress]       = useState(0);
  const [scanCandidates, setScanCandidates]   = useState<CameraCandidate[]>([]);
  const [subnet, setSubnet]                   = useState('192.168.1');
  const [discoverySource, setDiscoverySource] = useState<'backend' | 'browser' | 'agent-wait' | null>(null);
  const [backendDevices, setBackendDevices]   = useState<DiscoveredCamera[]>([]);
  const [agentWaitSeconds, setAgentWaitSeconds] = useState(0);
  const scanAbortRef  = useRef<AbortController | null>(null);
  const pollTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    detectLocalSubnet().then((s) => { if (s) setSubnet(s); });
    return () => { scanAbortRef.current?.abort(); };
  }, []);

  const selectedBrand = BRANDS.find((b) => b.id === brand);

  function handleNameChange(v: string) {
    setName(v);
    setCameraId(slugify(v));
  }

  function candidatesFromRows(rows: { ip: string; port: number; service_url?: string; manufacturer?: string; device_type?: string }[]): DiscoveredCamera[] {
    return rows.map((c) => {
      const mfr = (c.manufacturer ?? '').toLowerCase();
      const brand = mfr.includes('dahua') ? 'dahua' : mfr.includes('hikvision') ? 'hikvision' : mfr.includes('intelbras') ? 'intelbras' : 'generic';
      return {
        ip: c.ip, port: c.port ?? 80, brand,
        hasRtsp: c.port === 554 || (c.service_url?.startsWith('rtsp://') ?? false),
        manufacturer: c.manufacturer ?? undefined,
        model: c.device_type ?? undefined,
        onvifProfileToken: undefined, snapshotUrl: undefined,
      };
    });
  }

  async function fetchAgentCandidates(): Promise<DiscoveredCamera[]> {
    const eid = getCurrentEstablishmentId();
    const { data: agents } = await supabase.from('agent_configs').select('id').eq('establishment_id', eid);
    if (!agents?.length) return [];
    const agentIds = agents.map((a: { id: string }) => a.id);
    const { data: candidates } = await supabase
      .from('agent_camera_candidates')
      .select('ip, port, service_url, manufacturer, device_type, credentials_ok')
      .in('agent_id', agentIds);
    return candidates?.length ? candidatesFromRows(candidates as Parameters<typeof candidatesFromRows>[0]) : [];
  }

  async function hasOnlineAgent(): Promise<boolean> {
    const eid = getCurrentEstablishmentId();
    const { data: agents } = await supabase.from('agent_configs').select('id').eq('establishment_id', eid);
    if (!agents?.length) return false;
    const agentIds = agents.map((a: { id: string }) => a.id);
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: hb } = await supabase
      .from('agent_heartbeats')
      .select('id')
      .in('agent_id', agentIds)
      .gte('reported_at', tenMinutesAgo)
      .limit(1);
    return (hb?.length ?? 0) > 0;
  }

  async function startScan() {
    setScanning(true);
    setScanCandidates([]);
    setBackendDevices([]);
    setScanProgress(0);
    setDiscoverySource(null);
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    // 1. Agente local na mesma máquina (dev / instalação local)
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(`${BACKEND}/api/cameras/discover`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data: DiscoveredCamera[] = await res.json();
        setBackendDevices(data);
        setDiscoverySource('backend');
        setScanning(false);
        return;
      }
    } catch { /* agente local indisponível */ }

    // 2. Câmeras já reportadas pelo agente Python no Supabase
    try {
      const existing = await fetchAgentCandidates();
      if (existing.length > 0) {
        setBackendDevices(existing);
        setDiscoverySource('backend');
        setScanning(false);
        return;
      }
    } catch (err) { console.warn('agent_camera_candidates query failed:', err); }

    // 3. Agente online mas sem câmeras ainda — aguardar até 45s com polling
    try {
      const online = await hasOnlineAgent();
      if (online) {
        setDiscoverySource('agent-wait');
        setAgentWaitSeconds(45);
        let elapsed = 0;
        const poll = setInterval(async () => {
          elapsed += 3;
          setAgentWaitSeconds((s) => Math.max(0, s - 3));
          try {
            const found = await fetchAgentCandidates();
            if (found.length > 0) {
              clearInterval(poll);
              pollTimerRef.current = null;
              setBackendDevices(found);
              setDiscoverySource('backend');
              setScanning(false);
              return;
            }
          } catch { /* continua polling */ }
          if (elapsed >= 45) {
            clearInterval(poll);
            pollTimerRef.current = null;
            // Agente online mas não encontrou câmeras — avisa e para
            setDiscoverySource('backend');
            setBackendDevices([]);
            setScanning(false);
          }
        }, 3000);
        pollTimerRef.current = poll;
        return; // função termina; o interval cuida do resto
      }
    } catch { /* se a verificação falhar, vai ao browser scan */ }

    // 4. Último recurso: scan de browser (só funciona na mesma rede local)
    setDiscoverySource('browser');
    const cap = await checkScanCapability(subnet);
    setScanCapability(cap);
    if (cap === 'blocked') { setScanning(false); return; }

    const abort = new AbortController();
    scanAbortRef.current = abort;
    const found = await scanNetwork(subnet, (partial, scanned, total) => {
      setScanCandidates(partial.filter((c) => c.hasRtsp || c.openPorts.includes(8000) || c.openPorts.includes(37777)));
      setScanProgress(Math.round((scanned / total) * 100));
    }, abort.signal);
    setScanCandidates(found.filter((c) => c.hasRtsp || c.openPorts.includes(8000) || c.openPorts.includes(37777)));
    setScanning(false);
  }

  function selectBackendCamera(cam: DiscoveredCamera) {
    setIp(cam.ip);
    setPort(String(cam.port || 80));
    const brandMap: Record<string, CameraBrand> = {
      intelbras: 'intelbras', hikvision: 'hikvision', dahua: 'dahua',
    };
    setBrand(brandMap[cam.brand?.toLowerCase()] ?? 'generic');
    if (cam.manufacturer || cam.model) {
      handleNameChange([cam.manufacturer, cam.model].filter(Boolean).join(' '));
    }
  }

  function selectScanCandidate(cam: CameraCandidate) {
    setIp(cam.ip);
    setPort(String(cam.httpPort || 80));
    setBrand(cam.likelyBrand as CameraBrand);
    handleNameChange(`Câmera ${BACKEND_BRAND_LABELS[cam.likelyBrand] ?? 'Genérica'}`);
  }

  async function saveCamera() {
    if (!name.trim()) { setFormError(t('cameras.errorName')); return; }
    if (!cameraId.trim()) { setFormError(t('cameras.errorId')); return; }
    setFormError('');
    setSaving(true);
    try {
      const cam = await cameraService.addCamera({
        name: name.trim(),
        cameraId: cameraId.trim(),
        ip: ip.trim() || undefined,
        port: parseInt(port) || 80,
        brand: brand ?? 'generic',
        cameraType,
      });
      setSavedCam(cam);
      setStep('configure');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError(msg.includes('unique') ? t('cameras.errorDuplicateId') : msg);
    } finally {
      setSaving(false);
    }
  }

  async function startTest() {
    if (!savedCam) return;
    setTesting(true);
    setTestResult('waiting');
    const ok = await cameraService.waitForFirstEvent(savedCam.cameraId, 60_000);
    setTestResult(ok ? 'ok' : 'timeout');
    setTesting(false);
    if (ok) await cameraService.updateCamera(savedCam.id, { status: 'online' });
  }

  function finish() {
    if (savedCam) onDone(savedCam);
    onClose();
  }

  // ── renders ──────────────────────────────────────────────────────────────

  function renderBrand() {
    return (
      <div className="space-y-3">
        <p className="text-[13px]" style={{ color: 'var(--color-text-dim)' }}>{t('cameras.wizard.brandDesc')}</p>
        <div className="grid grid-cols-2 gap-2">
          {BRANDS.map((b) => (
            <button key={b.id} onClick={() => { setBrand(b.id); setStep('ip'); }}
              className="flex flex-col items-start p-3.5 rounded-xl text-left transition-all gap-1"
              style={{ background: b.color, border: '1px solid var(--color-border-strong)' }}>
              <span className="text-[15px] font-bold text-text">{b.label}</span>
              <span className="text-[11px]" style={{ color: 'var(--color-text-dim)' }}>
                via {b.hint}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderIp() {
    return (
      <div className="space-y-4">
        {/* Instrução de como achar o IP */}
        <div className="rounded-xl p-4 space-y-3"
          style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border-strong)' }}>
          <div className="flex items-center gap-2">
            <HelpCircle size={15} style={{ color: 'var(--color-primary)' }} />
            <p className="text-[13px] font-semibold text-text">
              {t('cameras.wizard.howToFindIp', { brand: selectedBrand?.label })}
            </p>
          </div>
          {selectedBrand?.appSteps.map((s, i) => (
            <div key={i} className="flex gap-2.5 items-start">
              <span className="shrink-0 w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center"
                style={{ background: 'rgba(79,124,255,0.12)', color: 'var(--color-primary)' }}>{i + 1}</span>
              <p className="text-[12px]" style={{ color: 'var(--color-text-dim)' }}>{s}</p>
            </div>
          ))}
        </div>

        {/* Campo IP */}
        <div>
          <label className="text-[12px] font-medium" style={{ color: 'var(--color-text-dim)' }}>
            {t('cameras.wizard.ipLabel')}
          </label>
          <div className="flex gap-2 mt-1.5">
            <input value={ip} onChange={(e) => setIp(e.target.value)}
              placeholder="192.168.1.100"
              className="flex-1 px-3 py-2.5 rounded-lg text-[15px] font-mono"
              style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border-strong)', color: 'var(--color-text)' }} />
            <input value={port} onChange={(e) => setPort(e.target.value)}
              placeholder="80"
              className="w-16 px-3 py-2.5 rounded-lg text-[14px] font-mono text-center"
              style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border-strong)', color: 'var(--color-text)' }} />
          </div>
          <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {t('cameras.wizard.portHint')}
          </p>
        </div>

        {/* Scan opcional */}
        <div>
          <button onClick={() => setShowScan((v) => !v)}
            className="flex items-center gap-1.5 text-[12px] font-medium"
            style={{ color: 'var(--color-primary)' }}>
            {showScan ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            {t('cameras.wizard.dontKnowIp')}
          </button>

          {showScan && (
            <div className="mt-3 space-y-2 p-3 rounded-xl"
              style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}>
              <p className="text-[12px]" style={{ color: 'var(--color-text-dim)' }}>
                {t('cameras.wizard.scanDesc')} <span className="font-mono">{subnet}.x</span>
              </p>

              {scanCapability === 'blocked' && discoverySource === 'browser' && (
                <div className="flex gap-2 p-2 rounded-lg" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <AlertCircle size={13} className="shrink-0 mt-0.5" style={{ color: 'var(--color-warning)' }} />
                  <p className="text-[11px]" style={{ color: 'var(--color-warning)' }}>{t('cameras.scanBlocked')}</p>
                </div>
              )}

              {scanning ? (
                <div className="space-y-2">
                  {discoverySource === 'agent-wait' ? (
                    <div className="rounded-xl p-3 space-y-2.5"
                      style={{ background: 'rgba(79,124,255,0.06)', border: '1px solid rgba(79,124,255,0.2)' }}>
                      <div className="flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin shrink-0" style={{ color: 'var(--color-primary)' }} />
                        <span className="text-[12px] font-medium" style={{ color: 'var(--color-primary)' }}>
                          Agente online — buscando câmeras na rede…
                        </span>
                      </div>
                      <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-2)' }}>
                        <motion.div className="h-full rounded-full" style={{ background: 'var(--color-primary)' }}
                          animate={{ width: `${Math.round(((45 - agentWaitSeconds) / 45) * 100)}%` }}
                          transition={{ duration: 0.5 }} />
                      </div>
                      <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                        O agente Windows está escaneando a rede local. Aguardando resultado… ({agentWaitSeconds}s)
                      </p>
                      <button
                        onClick={() => {
                          if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
                          setScanning(false);
                          setDiscoverySource(null);
                        }}
                        className="text-[11px] underline underline-offset-2"
                        style={{ color: 'var(--color-text-muted)' }}>
                        Prefiro digitar o IP manualmente
                      </button>
                    </div>
                  ) : discoverySource === 'browser' ? (
                    <>
                      <div className="flex justify-between text-[11px]" style={{ color: 'var(--color-text-dim)' }}>
                        <span>{t('cameras.scanningNet')}</span><span>{scanProgress}%</span>
                      </div>
                      <div className="w-full h-1 rounded-full" style={{ background: 'var(--color-surface-2)' }}>
                        <motion.div className="h-full rounded-full" style={{ background: 'var(--color-primary)' }}
                          animate={{ width: `${scanProgress}%` }} transition={{ duration: 0.3 }} />
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center gap-2 py-2">
                      <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
                      <span className="text-[12px]" style={{ color: 'var(--color-text-dim)' }}>Detectando câmeras...</span>
                    </div>
                  )}
                </div>
              ) : (
                <button onClick={startScan}
                  className="w-full py-2 rounded-lg text-[12px] font-semibold text-white"
                  style={{ background: 'var(--color-primary)' }}>
                  <span className="flex items-center justify-center gap-1.5">
                    <Wifi size={13} /> {t('cameras.startScan')}
                  </span>
                </button>
              )}

              {/* Resultados do agente / Supabase */}
              {!scanning && discoverySource === 'backend' && backendDevices.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold" style={{ color: 'var(--color-success)' }}>
                    {backendDevices.length === 1
                      ? '1 câmera encontrada na rede'
                      : `${backendDevices.length} câmeras encontradas — clique na sua`}
                  </p>
                  {backendDevices.map((cam) => {
                    const brandLabel = BACKEND_BRAND_LABELS[cam.brand?.toLowerCase()] ?? cam.brand ?? 'Câmera';
                    const isDvr = cam.model?.toLowerCase().includes('dvr') || cam.model?.toLowerCase().includes('nvr');
                    const deviceLabel = isDvr
                      ? `DVR ${brandLabel}${cam.model ? ` — ${cam.model}` : ''}`
                      : `Câmera ${brandLabel}${cam.manufacturer && cam.manufacturer !== brandLabel ? ` (${cam.manufacturer})` : ''}`;
                    const selected = ip === cam.ip;
                    return (
                      <button key={cam.ip} onClick={() => selectBackendCamera(cam)}
                        className={cn('w-full text-left rounded-xl overflow-hidden transition-all',
                          selected ? 'ring-2 ring-primary' : '')}
                        style={{
                          background: selected ? 'rgba(79,124,255,0.08)' : 'var(--color-surface-2)',
                          border: `1px solid ${selected ? 'rgba(79,124,255,0.5)' : 'var(--color-border-strong)'}`,
                        }}>
                        <div className="flex gap-0 items-stretch">
                          {/* thumbnail */}
                          <div className="w-20 shrink-0 rounded-l-xl overflow-hidden"
                            style={{ background: '#000', minHeight: 56 }}>
                            <SnapshotProbe ip={cam.ip} port={cam.port} />
                          </div>
                          {/* info */}
                          <div className="flex-1 min-w-0 px-3 py-2.5 flex flex-col justify-center gap-0.5">
                            <p className="text-[13px] font-semibold text-text leading-tight">{deviceLabel}</p>
                            <p className="text-[11px] font-mono" style={{ color: 'var(--color-text-muted)' }}>{cam.ip}</p>
                          </div>
                          {/* selected check */}
                          {selected && (
                            <div className="shrink-0 pr-3 flex items-center">
                              <div className="w-5 h-5 rounded-full flex items-center justify-center"
                                style={{ background: 'var(--color-primary)' }}>
                                <Check size={11} className="text-white" />
                              </div>
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Resultados do scan do browser */}
              {!scanning && discoverySource === 'browser' && scanCandidates.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold" style={{ color: 'var(--color-success)' }}>
                    {scanCandidates.length === 1
                      ? '1 câmera encontrada — clique para selecionar'
                      : `${scanCandidates.length} câmeras encontradas — clique na sua`}
                  </p>
                  {scanCandidates.map((cam) => {
                    const brandLabel = BACKEND_BRAND_LABELS[cam.likelyBrand] ?? 'Câmera';
                    const rtspLabel = cam.hasRtsp ? 'Vídeo ativo' : 'Dispositivo de câmera';
                    const selected = ip === cam.ip;
                    return (
                      <button key={cam.ip} onClick={() => selectScanCandidate(cam)}
                        className={cn('w-full text-left rounded-xl overflow-hidden transition-all',
                          selected ? 'ring-2 ring-primary' : '')}
                        style={{
                          background: selected ? 'rgba(79,124,255,0.08)' : 'var(--color-surface-2)',
                          border: `1px solid ${selected ? 'rgba(79,124,255,0.5)' : 'var(--color-border-strong)'}`,
                        }}>
                        <div className="flex gap-0 items-stretch">
                          {/* thumbnail */}
                          <div className="w-20 shrink-0 rounded-l-xl overflow-hidden"
                            style={{ background: '#000', minHeight: 56 }}>
                            <SnapshotProbe ip={cam.ip} port={cam.httpPort} />
                          </div>
                          {/* info */}
                          <div className="flex-1 min-w-0 px-3 py-2.5 flex flex-col justify-center gap-0.5">
                            <p className="text-[13px] font-semibold text-text leading-tight">
                              {brandLabel !== 'Genérica' ? `Câmera ${brandLabel}` : rtspLabel}
                            </p>
                            <p className="text-[11px] font-mono" style={{ color: 'var(--color-text-muted)' }}>{cam.ip}</p>
                          </div>
                          {/* selected check */}
                          {selected && (
                            <div className="shrink-0 pr-3 flex items-center">
                              <div className="w-5 h-5 rounded-full flex items-center justify-center"
                                style={{ background: 'var(--color-primary)' }}>
                                <Check size={11} className="text-white" />
                              </div>
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {!scanning && discoverySource === 'backend' && backendDevices.length === 0 && (
                <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  {t('cameras.noCandidates')}
                </p>
              )}
              {!scanning && discoverySource === 'browser' && scanCapability !== null && scanCandidates.length === 0 && scanCapability !== 'blocked' && (
                <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  {t('cameras.noCandidates')}
                </p>
              )}
            </div>
          )}
        </div>

        <button
          onClick={() => { if (ip.trim()) setStep('name'); else setFormError(t('cameras.wizard.ipRequired')); }}
          className="w-full py-3 rounded-xl text-[14px] font-semibold text-white"
          style={{ background: 'var(--color-primary)' }}>
          {t('cameras.wizard.continue')}
        </button>
        {formError && (
          <p className="text-[12px] text-center" style={{ color: 'var(--color-danger)' }}>{formError}</p>
        )}
      </div>
    );
  }

  function renderName() {
    return (
      <div className="space-y-4">
        <div>
          <label className="text-[12px] font-medium" style={{ color: 'var(--color-text-dim)' }}>
            {t('cameras.form.name')} *
          </label>
          <input value={name} onChange={(e) => handleNameChange(e.target.value)}
            placeholder={t('cameras.form.namePlaceholder')} autoFocus
            className="w-full mt-1.5 px-3 py-2.5 rounded-lg text-[15px]"
            style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border-strong)', color: 'var(--color-text)' }} />
        </div>

        <div>
          <label className="text-[12px] font-medium" style={{ color: 'var(--color-text-dim)' }}>
            {t('cameras.type.label')}
          </label>
          <div className="grid grid-cols-2 gap-2 mt-1.5">
            {(['people_counting', 'cash_register'] as CameraType[]).map((type) => (
              <button key={type} onClick={() => setCameraType(type)}
                className="py-2.5 rounded-lg text-[12px] font-medium transition-all"
                style={{
                  background: cameraType === type ? 'rgba(79,124,255,0.15)' : 'var(--color-surface-alt)',
                  border: cameraType === type ? '1px solid rgba(79,124,255,0.4)' : '1px solid var(--color-border-strong)',
                  color: cameraType === type ? 'var(--color-primary)' : 'var(--color-text-dim)',
                }}>
                {type === 'people_counting' ? t('cameras.type.counting') : t('cameras.type.cash')}
              </button>
            ))}
          </div>
        </div>

        {/* ID gerado */}
        {cameraId && (
          <div className="px-3 py-2 rounded-lg" style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>ID gerado</p>
            <p className="font-mono text-[13px] mt-0.5 text-text">{cameraId}</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{t('cameras.form.cameraIdHint')}</p>
          </div>
        )}

        {formError && (
          <div className="flex gap-2 p-2.5 rounded-lg" style={{ background: 'rgba(240,82,82,0.08)', border: '1px solid rgba(240,82,82,0.2)' }}>
            <AlertCircle size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--color-danger)' }} />
            <p className="text-[12px]" style={{ color: 'var(--color-danger)' }}>{formError}</p>
          </div>
        )}

        <button onClick={saveCamera} disabled={saving}
          className="w-full py-3 rounded-xl text-[14px] font-semibold text-white disabled:opacity-60 flex items-center justify-center gap-2"
          style={{ background: 'var(--color-primary)' }}>
          {saving && <Loader2 size={15} className="animate-spin" />}
          {saving ? t('cameras.saving') : t('cameras.saveAndConfigure')}
        </button>
      </div>
    );
  }

  function renderConfigure() {
    if (!savedCam) return null;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 p-3 rounded-lg"
          style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
          <CheckCircle2 size={15} style={{ color: 'var(--color-success)' }} />
          <p className="text-[13px] font-medium" style={{ color: 'var(--color-success)' }}>
            {t('cameras.savedSuccess', { name: savedCam.name })}
          </p>
        </div>
        <p className="text-[13px]" style={{ color: 'var(--color-text-dim)' }}>{t('cameras.configureDesc')}</p>
        <ConfigInstructions brand={savedCam.brand} webhookUrl={webhookUrl} token={token} cameraId={savedCam.cameraId} />
        <button onClick={() => setStep('test')}
          className="w-full py-3 rounded-xl text-[14px] font-semibold text-white flex items-center justify-center gap-2"
          style={{ background: 'var(--color-primary)' }}>
          <Zap size={15} /> {t('cameras.testConnection')}
        </button>
        <button onClick={finish}
          className="w-full py-2.5 rounded-xl text-[13px] font-medium"
          style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)', color: 'var(--color-text-dim)' }}>
          {t('cameras.skipTest')}
        </button>
      </div>
    );
  }

  function renderTest() {
    return (
      <div className="space-y-4">
        <p className="text-[13px]" style={{ color: 'var(--color-text-dim)' }}>{t('cameras.testDesc')}</p>
        <div className="p-4 rounded-xl text-center space-y-3"
          style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border-strong)' }}>
          {testResult === null && (
            <button onClick={startTest}
              className="px-6 py-3 rounded-xl text-[14px] font-semibold text-white flex items-center gap-2 mx-auto"
              style={{ background: 'var(--color-primary)' }}>
              <Radio size={15} /> {t('cameras.waitForEvent')}
            </button>
          )}
          {testResult === 'waiting' && (
            <div className="space-y-2">
              <Loader2 size={28} className="animate-spin mx-auto" style={{ color: 'var(--color-primary)' }} />
              <p className="text-[13px]" style={{ color: 'var(--color-text-dim)' }}>{t('cameras.testWaiting')}</p>
              <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{t('cameras.testWaitingHint')}</p>
            </div>
          )}
          {testResult === 'ok' && (
            <div className="space-y-2">
              <CheckCircle2 size={32} className="mx-auto" style={{ color: 'var(--color-success)' }} />
              <p className="text-[14px] font-semibold" style={{ color: 'var(--color-success)' }}>{t('cameras.testOk')}</p>
            </div>
          )}
          {testResult === 'timeout' && (
            <div className="space-y-2">
              <WifiOff size={28} className="mx-auto" style={{ color: 'var(--color-text-muted)' }} />
              <p className="text-[13px]" style={{ color: 'var(--color-text-dim)' }}>{t('cameras.testTimeout')}</p>
              <button onClick={startTest} className="text-[12px] font-medium" style={{ color: 'var(--color-primary)' }}>
                {t('cameras.testRetry')}
              </button>
            </div>
          )}
        </div>
        <button onClick={finish}
          className="w-full py-3 rounded-xl text-[14px] font-semibold text-white"
          style={{ background: 'var(--color-primary)' }}>
          {t('cameras.finish')}
        </button>
      </div>
    );
  }

  const stepTitles: Record<WizardStep, string> = {
    brand:     t('cameras.wizard.brand'),
    ip:        t('cameras.wizard.ip', { brand: selectedBrand?.label ?? '' }),
    name:      t('cameras.wizard.name'),
    configure: t('cameras.wizard.configure'),
    test:      t('cameras.wizard.test'),
  };

  const backMap: Partial<Record<WizardStep, WizardStep>> = {
    ip: 'brand', name: 'ip', configure: 'name',
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 350, damping: 35 }}
        className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-strong)' }}
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-2">
            {backMap[step] && (
              <button onClick={() => { setFormError(''); setStep(backMap[step]!); }}
                className="w-7 h-7 rounded-lg flex items-center justify-center mr-1"
                style={{ background: 'var(--color-surface-alt)' }}>
                <ArrowLeft size={13} style={{ color: 'var(--color-text-dim)' }} />
              </button>
            )}
            <p className="text-[15px] font-bold text-text">{stepTitles[step]}</p>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--color-surface-alt)' }}>
            <X size={14} style={{ color: 'var(--color-text-dim)' }} />
          </button>
        </div>

        {/* Indicador de progresso */}
        <div className="flex gap-1 px-5 pt-3">
          {(['brand', 'ip', 'name', 'configure', 'test'] as WizardStep[]).map((s, i) => {
            const steps: WizardStep[] = ['brand', 'ip', 'name', 'configure', 'test'];
            const current = steps.indexOf(step);
            return (
              <div key={s} className="flex-1 h-0.5 rounded-full transition-all"
                style={{ background: i <= current ? 'var(--color-primary)' : 'var(--color-border-strong)' }} />
            );
          })}
        </div>

        <div className="px-5 py-5">
          <AnimatePresence mode="wait">
            <motion.div key={step}
              initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }}>
              {step === 'brand'     && renderBrand()}
              {step === 'ip'        && renderIp()}
              {step === 'name'      && renderName()}
              {step === 'configure' && renderConfigure()}
              {step === 'test'      && renderTest()}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Cameras() {
  const { t } = useTranslation();
  const [cameras, setCameras]     = useState<Camera[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [deleting, setDeleting]   = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try { setCameras(await cameraService.getCameras()); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    void load();

    // Câmeras auto-registradas pelo agente aparecem em tempo real
    const eid = getCurrentEstablishmentId();
    const channel = supabase
      .channel('cameras-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cameras', filter: `establishment_id=eq.${eid}` },
        () => { void load(); },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDelete(id: string) {
    if (!confirm(t('cameras.deleteConfirm'))) return;
    setDeleting(id);
    await cameraService.deleteCamera(id);
    setCameras((prev) => prev.filter((c) => c.id !== id));
    setDeleting(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-text">{t('cameras.title')}</h1>
          <p className="text-[13px] mt-0.5" style={{ color: 'var(--color-text-dim)' }}>{t('cameras.subtitle')}</p>
        </div>
        <button onClick={() => setShowWizard(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium"
          style={{ border: '1px solid var(--color-border-strong)', color: 'var(--color-text-dim)', background: 'var(--color-surface-alt)' }}>
          <Plus size={15} /> Adicionar manualmente
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-text-muted)' }} />
        </div>
      ) : cameras.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="text-center py-16 space-y-5 rounded-2xl"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center"
            style={{ background: 'rgba(79,124,255,0.08)', border: '1px solid rgba(79,124,255,0.15)' }}>
            <CameraIcon size={26} style={{ color: 'var(--color-primary)', opacity: 0.8 }} />
          </div>
          <div className="space-y-1.5 px-6">
            <p className="text-[16px] font-bold text-text">Nenhuma câmera ainda</p>
            <p className="text-[13px] max-w-sm mx-auto leading-relaxed" style={{ color: 'var(--color-text-dim)' }}>
              Com o agente instalado no PC do estabelecimento, as câmeras da rede aparecem aqui
              <span className="font-semibold"> automaticamente</span> — sem configuração.
            </p>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px]"
              style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--color-success)' }}>
              <Loader2 size={12} className="animate-spin" />
              Aguardando descoberta pelo agente…
            </div>
            <button onClick={() => setShowWizard(true)}
              className="text-[12px] underline underline-offset-2"
              style={{ color: 'var(--color-text-muted)' }}>
              Prefiro adicionar o IP manualmente
            </button>
          </div>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cameras.map((cam) => (
            <div key={cam.id} className={cn(deleting === cam.id ? 'opacity-50 pointer-events-none' : '')}>
              <CameraCard cam={cam} onDelete={() => handleDelete(cam.id)} />
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showWizard && (
          <Wizard
            onClose={() => setShowWizard(false)}
            onDone={(cam) => setCameras((prev) => [...prev.filter((c) => c.id !== cam.id), cam])}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
