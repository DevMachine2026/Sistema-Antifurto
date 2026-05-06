import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Cpu, Plus, X, Loader2, CheckCircle2, XCircle,
  Wifi, WifiOff, ChevronDown, ChevronRight,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCurrentEstablishmentId } from '../lib/tenant';

// ── types ─────────────────────────────────────────────────────────────────────

interface CameraConfig {
  id: string;
  ip: string;
  role: 'counting' | 'cash';
  name: string;
  line_y: number;
  rtsp_path: string;
}

interface AgentConfig {
  id: string;
  name: string;
  cameras: CameraConfig[];
  heartbeat_interval: number;
  active: boolean;
  last_connected_at: string | null;
}

interface AgentHeartbeat {
  agent_id: string;
  version: string;
  cameras_online: number;
  last_inference: string | null;
  reported_at: string;
}

interface CameraCandidate {
  id: string;
  agent_id: string;
  ip: string;
  mac: string | null;
  name: string | null;
  approved: boolean | null;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `há ${diff}s`;
  if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
  return `há ${Math.floor(diff / 3600)}h`;
}

function isOnline(hb: AgentHeartbeat | undefined): boolean {
  if (!hb) return false;
  return Date.now() - new Date(hb.reported_at).getTime() < 10 * 60 * 1000;
}

// ── AgentToken ────────────────────────────────────────────────────────────────

function AgentToken({ agentId }: { agentId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  async function loadToken() {
    const { data } = await supabase
      .from('agent_configs')
      .select('token')
      .eq('id', agentId)
      .single();
    setToken(data?.token ?? null);
    setVisible(true);
  }

  if (!visible)
    return (
      <button
        type="button"
        onClick={loadToken}
        className="text-xs font-bold hover:underline"
        style={{ color: 'var(--color-primary)' }}
      >
        Mostrar token de instalação
      </button>
    );

  return (
    <code
      className="text-xs font-mono rounded px-2 py-1 select-all break-all"
      style={{
        background: 'var(--color-surface-alt)',
        border: '1px solid var(--color-border)',
        color: 'var(--color-text)',
      }}
    >
      {token ?? 'carregando...'}
    </code>
  );
}

// ── AgentCard ─────────────────────────────────────────────────────────────────

function AgentCard({
  agent,
  heartbeat,
  candidates,
  onApprove,
  onIgnore,
}: {
  agent: AgentConfig;
  heartbeat: AgentHeartbeat | undefined;
  candidates: CameraCandidate[];
  onApprove: (candidate: CameraCandidate) => Promise<void>;
  onIgnore: (candidate: CameraCandidate) => Promise<void>;
}) {
  const online = isOnline(heartbeat);
  const [expanded, setExpanded] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  async function handleApprove(c: CameraCandidate) {
    setApprovingId(c.id);
    await onApprove(c);
    setApprovingId(null);
  }

  async function handleIgnore(c: CameraCandidate) {
    setApprovingId(c.id);
    await onIgnore(c);
    setApprovingId(null);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      {/* ── Header ── */}
      <div className="p-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: online ? 'rgba(16,185,129,0.1)' : 'rgba(107,114,128,0.1)',
              border: `1px solid ${online ? 'rgba(16,185,129,0.25)' : 'rgba(107,114,128,0.2)'}`,
            }}
          >
            <Cpu
              size={16}
              style={{ color: online ? 'var(--color-success)' : 'var(--color-text-muted)' }}
            />
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-text truncate">{agent.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {online ? (
                <Wifi size={11} style={{ color: 'var(--color-success)' }} />
              ) : (
                <WifiOff size={11} style={{ color: 'var(--color-text-muted)' }} />
              )}
              <span
                className="text-[11px] font-medium"
                style={{ color: online ? 'var(--color-success)' : 'var(--color-text-muted)' }}
              >
                {online ? 'Online' : 'Offline'}
              </span>
              {heartbeat && (
                <span className="text-[11px]" style={{ color: 'var(--color-text-dim)' }}>
                  · {timeAgo(heartbeat.reported_at)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* expand/collapse candidates button */}
        {candidates.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold shrink-0 transition-all"
            style={{
              background: 'rgba(245,158,11,0.1)',
              border: '1px solid rgba(245,158,11,0.25)',
              color: 'var(--color-warning)',
            }}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {candidates.length} câmera{candidates.length !== 1 ? 's' : ''} ONVIF
          </button>
        )}
      </div>

      {/* ── Heartbeat stats ── */}
      {heartbeat && (
        <div
          className="mx-4 mb-3 px-3 py-2.5 rounded-lg grid grid-cols-3 gap-2 text-center"
          style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}
        >
          <div>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
              Versão
            </p>
            <p className="text-[12px] font-mono font-medium text-text mt-0.5">{heartbeat.version || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
              Câmeras
            </p>
            <p className="text-[12px] font-medium text-text mt-0.5">{heartbeat.cameras_online}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
              Último frame
            </p>
            <p className="text-[12px] font-medium text-text mt-0.5">
              {heartbeat.last_inference ? timeAgo(heartbeat.last_inference) : '—'}
            </p>
          </div>
        </div>
      )}

      {/* ── Token ── */}
      <div className="px-4 pb-4">
        <AgentToken agentId={agent.id} />
      </div>

      {/* ── Camera candidates ── */}
      <AnimatePresence>
        {expanded && candidates.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div
              className="mx-4 mb-4 rounded-xl overflow-hidden"
              style={{ border: '1px solid rgba(245,158,11,0.3)' }}
            >
              <div
                className="px-3 py-2"
                style={{ background: 'rgba(245,158,11,0.07)', borderBottom: '1px solid rgba(245,158,11,0.2)' }}
              >
                <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-warning)' }}>
                  Câmeras ONVIF descobertas — pendentes de aprovação
                </p>
              </div>
              <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                {candidates.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-mono font-medium text-text">{c.ip}</p>
                      {(c.name || c.mac) && (
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-dim)' }}>
                          {[c.name, c.mac].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={approvingId === c.id}
                        onClick={() => handleApprove(c)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-50"
                        style={{
                          background: 'rgba(16,185,129,0.1)',
                          border: '1px solid rgba(16,185,129,0.25)',
                          color: 'var(--color-success)',
                        }}
                      >
                        {approvingId === c.id ? (
                          <Loader2 size={10} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={11} />
                        )}
                        Aprovar
                      </button>
                      <button
                        type="button"
                        disabled={approvingId === c.id}
                        onClick={() => handleIgnore(c)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-50"
                        style={{
                          background: 'rgba(240,82,82,0.07)',
                          border: '1px solid rgba(240,82,82,0.2)',
                          color: 'var(--color-danger)',
                        }}
                      >
                        <XCircle size={11} />
                        Ignorar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── CreateAgentModal ──────────────────────────────────────────────────────────

function CreateAgentModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (agent: AgentConfig) => void;
}) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!name.trim()) { setError('Informe um nome para o agente.'); return; }
    setSaving(true);
    setError('');
    try {
      const estId = getCurrentEstablishmentId();
      const { data, error: dbErr } = await supabase
        .from('agent_configs')
        .insert({ establishment_id: estId, name: name.trim(), cameras: [] })
        .select()
        .single();
      if (dbErr) throw dbErr;
      onCreate(data as AgentConfig);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 350, damping: 35 }}
        className="w-full max-w-sm rounded-2xl"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-strong)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <p className="text-[15px] font-bold text-text">Novo agente</p>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--color-surface-alt)' }}
          >
            <X size={14} style={{ color: 'var(--color-text-dim)' }} />
          </button>
        </div>

        {/* body */}
        <div className="px-5 py-5 space-y-4">
          <div>
            <label
              className="text-[12px] font-medium"
              style={{ color: 'var(--color-text-dim)' }}
            >
              Nome do agente *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); }}
              placeholder="Ex: Raspberry Pi - Caixa"
              autoFocus
              className="w-full mt-1.5 px-3 py-2.5 rounded-lg text-[14px]"
              style={{
                background: 'var(--color-surface-alt)',
                border: '1px solid var(--color-border-strong)',
                color: 'var(--color-text)',
              }}
            />
          </div>

          {error && (
            <p className="text-[12px]" style={{ color: 'var(--color-danger)' }}>{error}</p>
          )}

          <button
            type="button"
            onClick={handleCreate}
            disabled={saving}
            className="w-full py-3 rounded-xl text-[14px] font-semibold text-white disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: 'var(--color-primary)' }}
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            {saving ? 'Criando...' : 'Criar agente'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Agents() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [heartbeats, setHeartbeats] = useState<AgentHeartbeat[]>([]);
  const [candidates, setCandidates] = useState<CameraCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const estId = getCurrentEstablishmentId();
      const [agentsData, hbData, candData] = await Promise.all([
        supabase
          .from('agent_configs')
          .select('*')
          .eq('establishment_id', estId)
          .eq('active', true)
          .order('created_at'),
        supabase.from('agent_heartbeats').select('*'),
        supabase.from('agent_camera_candidates').select('*').is('approved', null),
      ]);
      setAgents((agentsData.data ?? []) as AgentConfig[]);
      setHeartbeats((hbData.data ?? []) as AgentHeartbeat[]);
      setCandidates((candData.data ?? []) as CameraCandidate[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function approveCandidate(candidate: CameraCandidate) {
    const agent = agents.find((a) => a.id === candidate.agent_id);
    if (!agent) return;

    const newCamera: CameraConfig = {
      id: crypto.randomUUID(),
      ip: candidate.ip,
      name: candidate.name ?? candidate.ip,
      role: 'counting',
      line_y: 0.5,
      rtsp_path: '/stream1',
    };

    const updatedCameras = [...(agent.cameras ?? []), newCamera];

    await Promise.all([
      supabase
        .from('agent_configs')
        .update({ cameras: updatedCameras, config_changed_at: new Date().toISOString() })
        .eq('id', agent.id),
      supabase
        .from('agent_camera_candidates')
        .update({ approved: true })
        .eq('id', candidate.id),
    ]);

    setAgents((prev) =>
      prev.map((a) => (a.id === agent.id ? { ...a, cameras: updatedCameras } : a))
    );
    setCandidates((prev) => prev.filter((c) => c.id !== candidate.id));
  }

  async function ignoreCandidate(candidate: CameraCandidate) {
    await supabase
      .from('agent_camera_candidates')
      .update({ approved: false })
      .eq('id', candidate.id);
    setCandidates((prev) => prev.filter((c) => c.id !== candidate.id));
  }

  const hbMap = Object.fromEntries(heartbeats.map((hb) => [hb.agent_id, hb]));
  const candByAgent = candidates.reduce<Record<string, CameraCandidate[]>>((acc, c) => {
    acc[c.agent_id] = [...(acc[c.agent_id] ?? []), c];
    return acc;
  }, {});

  const onlineCount = agents.filter((a) => isOnline(hbMap[a.id])).length;

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-text">Agentes</h1>
          <p className="text-[13px] mt-0.5" style={{ color: 'var(--color-text-dim)' }}>
            Raspberry Pi e PCs com o software Olho Vivo instalado
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold text-white"
          style={{ background: 'var(--color-primary)' }}
        >
          <Plus size={15} /> Novo agente
        </button>
      </div>

      {/* ── Stats row ── */}
      {!loading && agents.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total', value: agents.length },
            { label: 'Online', value: onlineCount, color: 'var(--color-success)' },
            {
              label: 'Câmeras ONVIF',
              value: candidates.length,
              color: candidates.length > 0 ? 'var(--color-warning)' : undefined,
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl px-4 py-3 text-center"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            >
              <p
                className="text-[22px] font-bold"
                style={{ color: stat.color ?? 'var(--color-text)' }}
              >
                {stat.value}
              </p>
              <p className="text-[11px] uppercase tracking-wider mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── Content ── */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-text-muted)' }} />
        </div>
      ) : agents.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-16 space-y-4 rounded-xl"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <div
            className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center"
            style={{
              background: 'rgba(79,124,255,0.1)',
              border: '1px solid rgba(79,124,255,0.2)',
            }}
          >
            <Cpu size={24} style={{ color: 'var(--color-primary)' }} />
          </div>
          <div>
            <p className="text-[16px] font-bold text-text">Nenhum agente cadastrado</p>
            <p
              className="text-[13px] mt-1 max-w-xs mx-auto"
              style={{ color: 'var(--color-text-dim)' }}
            >
              Crie um agente para obter o token de instalação e conectar um Raspberry Pi ou PC.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white"
            style={{ background: 'var(--color-primary)' }}
          >
            <Plus size={15} /> Criar primeiro agente
          </button>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              heartbeat={hbMap[agent.id]}
              candidates={candByAgent[agent.id] ?? []}
              onApprove={approveCandidate}
              onIgnore={ignoreCandidate}
            />
          ))}
        </div>
      )}

      {/* ── Create modal ── */}
      <AnimatePresence>
        {showCreate && (
          <CreateAgentModal
            onClose={() => setShowCreate(false)}
            onCreate={(agent) => setAgents((prev) => [...prev, agent])}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
