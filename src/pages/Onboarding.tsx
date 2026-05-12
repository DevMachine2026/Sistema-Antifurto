/**
 * Onboarding.tsx — Fluxo de implantação guiada Zero Fricção
 *
 * 3 passos visuais com status em tempo real:
 *   1. Telegram (cliente clica link → bot confirma automaticamente)
 *   2. Agente (baixa instalador → Online fica verde sozinho)
 *   3. Câmera (aprovação pelo admin)
 */

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send, Cpu, Camera, CheckCircle2, Circle, Loader2,
  ExternalLink, Download, RefreshCw, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCurrentEstablishmentId } from '../lib/tenant';
import { cn } from '../lib/utils';

const BOT_USERNAME = 'sistemantifraude_bot';
const INSTALL_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-install`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const GITHUB_INSTALLER =
  'https://github.com/DevMachine2026/Sistema-Antifurto/releases/latest/download/OlhoVivoSetup.exe';

type StepStatus = 'pending' | 'active' | 'done';

interface State {
  telegramChatId: string | null;
  webhookToken: string | null;
  agentId: string | null;
  agentToken: string | null;
  agentOnline: boolean;
  cameraCandidate: { id: string; ip: string; name: string | null } | null;
  cameraApproved: boolean;
}

async function downloadInstaller(token: string, platform: 'windows' | 'linux') {
  if (platform === 'windows') {
    const a = document.createElement('a');
    a.href = GITHUB_INSTALLER;
    a.download = `OlhoVivoSetup_TOKEN_${token}.exe`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();
  const bearerToken = session?.access_token ?? ANON_KEY;

  const res = await fetch(`${INSTALL_URL}?token=${token}&platform=${platform}`, {
    headers: { Authorization: `Bearer ${bearerToken}` },
  });
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const filename = 'instalar-olhovivo.sh';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Onboarding() {
  const estId = getCurrentEstablishmentId();
  const [platform, setPlatform] = useState<'windows' | 'linux'>('windows');
  const [downloading, setDownloading] = useState(false);
  const [state, setState] = useState<State>({
    telegramChatId: null,
    webhookToken: null,
    agentId: null,
    agentToken: null,
    agentOnline: false,
    cameraCandidate: null,
    cameraApproved: false,
  });
  const [loading, setLoading] = useState(true);
  const [approvingCamera, setApprovingCamera] = useState(false);

  // ── carrega dados iniciais ────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const [settingsRes, agentsRes] = await Promise.all([
      supabase.from('settings').select('telegram_chat_id, webhook_token').eq('establishment_id', estId).single(),
      supabase.from('agent_configs').select('id, token').eq('establishment_id', estId).eq('active', true).order('created_at').limit(1),
    ]);

    const settings = settingsRes.data;
    const agent = agentsRes.data?.[0] ?? null;

    let agentOnline = false;
    let cameraCandidate = null;
    let cameraApproved = false;

    if (agent) {
      const [hbRes, candRes] = await Promise.all([
        supabase.from('agent_heartbeats').select('reported_at').eq('agent_id', agent.id).order('reported_at', { ascending: false }).limit(1),
        supabase.from('agent_camera_candidates').select('id, ip, name, approved').eq('agent_id', agent.id).order('created_at', { ascending: false }).limit(1),
      ]);

      const hb = hbRes.data?.[0];
      if (hb) agentOnline = Date.now() - new Date(hb.reported_at).getTime() < 10 * 60 * 1000;

      const cand = candRes.data?.[0];
      if (cand) {
        cameraCandidate = { id: cand.id, ip: cand.ip, name: cand.name };
        cameraApproved = cand.approved === true;
      }
    }

    setState({
      telegramChatId: settings?.telegram_chat_id ?? null,
      webhookToken: settings?.webhook_token ?? null,
      agentId: agent?.id ?? null,
      agentToken: agent?.token ?? null,
      agentOnline,
      cameraCandidate,
      cameraApproved,
    });
    setLoading(false);
  }, [estId]);

  useEffect(() => { load(); }, [load]);

  // ── polling automático enquanto aguardando ────────────────────────────────
  useEffect(() => {
    const allDone = state.telegramChatId && state.agentOnline && state.cameraApproved;
    if (allDone || loading) return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [state, loading, load]);

  // ── realtime para o Telegram ──────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase
      .channel(`onboarding:settings:${estId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'settings', filter: `establishment_id=eq.${estId}` }, (payload) => {
        const upd = payload.new as Record<string, unknown>;
        if (upd.telegram_chat_id) setState(s => ({ ...s, telegramChatId: upd.telegram_chat_id as string }));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [estId]);

  // ── aprovação de câmera ───────────────────────────────────────────────────
  async function approveCamera() {
    if (!state.cameraCandidate || !state.agentId) return;
    setApprovingCamera(true);
    const agentRes = await supabase.from('agent_configs').select('cameras').eq('id', state.agentId).single();
    const cameras = (agentRes.data?.cameras ?? []) as object[];
    const newCam = { id: crypto.randomUUID(), ip: state.cameraCandidate.ip, name: state.cameraCandidate.name ?? state.cameraCandidate.ip, role: 'counting', line_y: 0.5, rtsp_path: '/stream1' };
    await Promise.all([
      supabase.from('agent_configs').update({ cameras: [...cameras, newCam], config_changed_at: new Date().toISOString() }).eq('id', state.agentId),
      supabase.from('agent_camera_candidates').update({ approved: true }).eq('id', state.cameraCandidate.id),
    ]);
    setState(s => ({ ...s, cameraApproved: true }));
    setApprovingCamera(false);
  }

  // ── status de cada passo ──────────────────────────────────────────────────
  const step1: StepStatus = state.telegramChatId ? 'done' : 'active';
  const step2: StepStatus = state.agentOnline ? 'done' : step1 === 'done' ? 'active' : 'pending';
  const step3: StepStatus = state.cameraApproved ? 'done' : step2 === 'done' ? 'active' : 'pending';
  const allDone = step1 === 'done' && step2 === 'done' && step3 === 'done';

  const telegramLink = state.webhookToken ? `https://t.me/${BOT_USERNAME}?start=${state.webhookToken}` : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="animate-spin text-text-dim" size={24} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-16">
      {/* header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-text uppercase tracking-tight">Implantação guiada</h2>
          <p className="text-text-dim text-sm mt-1">Siga os 3 passos abaixo — o sistema confirma cada etapa automaticamente.</p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded text-[10px] font-black uppercase tracking-widest text-text-dim border border-border hover:text-text transition-colors bg-surface">
          <RefreshCw size={11} />
          Atualizar
        </button>
      </div>

      {/* progresso */}
      <div className="flex items-center gap-2">
        {[step1, step2, step3].map((s, i) => (
          <div key={i} className="flex items-center gap-2 flex-1">
            <div className={cn('w-2 h-2 rounded-full shrink-0', s === 'done' ? 'bg-success' : s === 'active' ? 'bg-primary animate-pulse' : 'bg-border')} />
            {i < 2 && <div className={cn('flex-1 h-px', s === 'done' ? 'bg-success/40' : 'bg-border')} />}
          </div>
        ))}
      </div>

      {/* ── Passo 1: Telegram ── */}
      <StepCard
        step={1}
        status={step1}
        icon={Send}
        title="Conectar Telegram"
        duration="1 min"
        description="O cliente abre o link no celular e clica em Iniciar. O sistema confirma automaticamente."
      >
        {step1 === 'done' ? (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-success/10 border border-success/30 text-success text-sm font-bold">
            <CheckCircle2 size={16} /> Telegram conectado ✅
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-text-dim">Envie o link abaixo para o cliente abrir no celular:</p>
            {telegramLink ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 bg-surface-alt border border-border rounded px-3 py-2.5">
                  <code className="flex-1 font-mono text-xs text-primary break-all">{telegramLink}</code>
                </div>
                <a
                  href={telegramLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded font-black text-[11px] uppercase tracking-widest hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                >
                  <ExternalLink size={13} /> Abrir link do Telegram
                </a>
                <p className="text-[10px] text-text-dim">
                  Aguardando o cliente clicar em Iniciar no @{BOT_USERNAME}…
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary ml-1 animate-pulse" />
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-warning text-xs">
                <AlertTriangle size={14} /> Token não encontrado — vá em Configurações para gerar um.
              </div>
            )}
          </div>
        )}
      </StepCard>

      {/* ── Passo 2: Agente ── */}
      <StepCard
        step={2}
        status={step2}
        icon={Cpu}
        title="Instalar o agente"
        duration="3 min"
        description="Baixe o instalador e envie para o cliente. Ele dá duplo clique — sem PowerShell."
      >
        {step2 === 'done' ? (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-success/10 border border-success/30 text-success text-sm font-bold">
            <CheckCircle2 size={16} /> Agente Online ✅
          </div>
        ) : step2 === 'active' ? (
          <div className="space-y-4">
            {/* seletor de plataforma */}
            <div className="flex gap-2">
              {(['windows', 'linux'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  className={cn('px-3 py-1.5 rounded text-[12px] font-semibold transition-all border', platform === p ? 'bg-primary text-white border-transparent' : 'bg-surface-alt text-text-dim border-border')}
                >
                  {p === 'windows' ? '🪟 Windows' : '🐧 Linux'}
                </button>
              ))}
            </div>

            {state.agentToken ? (
              <button
                onClick={async () => {
                  setDownloading(true);
                  try { await downloadInstaller(state.agentToken!, platform); }
                  finally { setDownloading(false); }
                }}
                disabled={downloading}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-[14px] font-bold text-white disabled:opacity-60"
                style={{ background: 'var(--color-primary)', boxShadow: '0 4px 20px rgba(79,124,255,0.3)' }}
              >
                {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                {platform === 'windows' ? 'Baixar instalador para Windows' : 'Baixar script para Linux'}
              </button>
            ) : (
              <div className="flex items-center gap-2 text-warning text-xs">
                <AlertTriangle size={14} /> Crie um agente primeiro em Agentes → Novo agente.
              </div>
            )}

            <div className="rounded-lg px-4 py-3 space-y-2" style={{ background: 'rgba(79,124,255,0.06)', border: '1px solid rgba(79,124,255,0.12)' }}>
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">Instruções para o cliente</p>
              {(platform === 'windows' ? [
                'Baixe e envie o instalador (.exe) por WhatsApp ou e-mail',
                'Cliente: duplo clique no ficheiro e avança no assistente (Next)',
                'Não precisa de ZIP, token em ficheiro nem janela de terminal',
                'Aguardar "Agente Online" ficar verde aqui',
              ] : [
                'Baixe e envie o arquivo .sh por e-mail',
                'Cliente: abre o Terminal e roda o arquivo',
                'Aguardar "Agente Online" ficar verde aqui',
              ]).map((s, i) => (
                <div key={s} className="flex items-start gap-2">
                  <span className="text-[10px] font-black rounded px-1.5 py-0.5 shrink-0 mt-0.5" style={{ background: 'rgba(79,124,255,0.2)', color: 'var(--color-primary)' }}>{i + 1}</span>
                  <p className="text-[12px] text-text-dim">{s}</p>
                </div>
              ))}
            </div>

            <p className="text-[10px] text-text-dim">
              Aguardando o agente ficar Online…
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary ml-1 animate-pulse" />
            </p>
          </div>
        ) : (
          <p className="text-xs text-text-dim">Disponível após conectar o Telegram.</p>
        )}
      </StepCard>

      {/* ── Passo 3: Câmera ── */}
      <StepCard
        step={3}
        status={step3}
        icon={Camera}
        title="Aprovar câmera"
        duration="1 min"
        description="O agente descobre câmeras ONVIF automaticamente. Você aprova aqui, o cliente não precisa fazer nada."
      >
        {step3 === 'done' ? (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-success/10 border border-success/30 text-success text-sm font-bold">
            <CheckCircle2 size={16} /> Câmera aprovada e contando ✅
          </div>
        ) : step3 === 'active' ? (
          <div className="space-y-3">
            {state.cameraCandidate ? (
              <div className="flex items-center gap-3 px-4 py-3 rounded-lg border" style={{ background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.3)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-mono font-medium text-text">{state.cameraCandidate.ip}</p>
                  {state.cameraCandidate.name && <p className="text-[11px] text-text-dim mt-0.5">{state.cameraCandidate.name}</p>}
                </div>
                <button
                  onClick={approveCamera}
                  disabled={approvingCamera}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold text-white disabled:opacity-50"
                  style={{ background: 'var(--color-success)' }}
                >
                  {approvingCamera ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                  Aprovar
                </button>
              </div>
            ) : (
              <p className="text-[10px] text-text-dim">
                Aguardando câmera ser descoberta automaticamente…
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-warning ml-1 animate-pulse" />
              </p>
            )}
            <p className="text-[10px] text-text-dim">
              Câmera não apareceu? Peça o IP e adicione a URL RTSP manualmente na página <strong>Agentes</strong>.
            </p>
          </div>
        ) : (
          <p className="text-xs text-text-dim">Disponível após o agente ficar Online.</p>
        )}
      </StepCard>

      {/* ── Conclusão ── */}
      <AnimatePresence>
        {allDone && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl px-6 py-5 text-center space-y-2"
            style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)' }}
          >
            <p className="text-2xl">🎉</p>
            <p className="text-base font-bold text-success uppercase tracking-tight">Implantação concluída!</p>
            <p className="text-xs text-text-dim">
              Telegram conectado · Agente Online · Câmera aprovada — o sistema está monitorando.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── StepCard ────────────────────────────────────────────────────────────────

function StepCard({
  step, status, icon: Icon, title, duration, description, children,
}: {
  step: number;
  status: StepStatus;
  icon: React.ElementType;
  title: string;
  duration: string;
  description: string;
  children: React.ReactNode;
}) {
  const colors: Record<StepStatus, { border: string; bg: string; icon: string }> = {
    done:    { border: 'border-success/30',  bg: 'bg-success/5',   icon: 'text-success' },
    active:  { border: 'border-primary/30',  bg: 'bg-primary/5',   icon: 'text-primary' },
    pending: { border: 'border-border',       bg: 'bg-surface',     icon: 'text-text-dim' },
  };
  const c = colors[status];

  return (
    <motion.div
      layout
      className={cn('rounded-xl p-5 space-y-4 transition-all', c.bg, 'border', c.border)}
    >
      <div className="flex items-start gap-4">
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-surface-alt', c.icon)}>
          {status === 'done' ? <CheckCircle2 size={18} /> : status === 'active' ? <Icon size={18} /> : <Circle size={18} className="opacity-40" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-black text-text-dim uppercase tracking-widest">Passo {step}</span>
            <span className="text-[10px] text-text-dim">·</span>
            <span className="text-[10px] text-text-dim">{duration}</span>
            {status === 'done' && (
              <span className="text-[10px] font-black text-success uppercase tracking-widest">✓ Concluído</span>
            )}
            {status === 'active' && (
              <span className="text-[10px] font-black text-primary uppercase tracking-widest animate-pulse">Em andamento</span>
            )}
          </div>
          <h3 className={cn('text-[15px] font-bold mt-0.5', status === 'pending' ? 'text-text-dim' : 'text-text')}>{title}</h3>
          <p className="text-[12px] text-text-dim mt-0.5">{description}</p>
        </div>
      </div>

      {status !== 'pending' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {children}
        </motion.div>
      )}
    </motion.div>
  );
}
