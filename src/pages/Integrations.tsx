import { useState, useEffect } from 'react';
import { Copy, Check, Wifi, WifiOff, Camera, Banknote, ShoppingBag, RefreshCw, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCurrentEstablishmentId } from '../lib/tenant';
import { auditService } from '../services/auditService';
import { cn } from '../lib/utils';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

interface IntegrationStatus {
  lastEvent: string | null;
  count: number;
}

function webhookUrl(fn: string) {
  return `${SUPABASE_URL}/functions/v1/${fn}`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={copy}
      className="shrink-0 p-1.5 rounded hover:bg-surface-alt transition-colors text-text-dim hover:text-text"
    >
      {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
    </button>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <div className={cn(
      'flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded',
      active ? 'bg-success/10 text-success' : 'bg-surface-alt text-text-dim'
    )}>
      {active ? <Wifi size={11} /> : <WifiOff size={11} />}
      {active ? 'Ativo' : 'Aguardando'}
    </div>
  );
}

export default function Integrations() {
  const establishmentId = getCurrentEstablishmentId();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [status, setStatus] = useState<{
    camera: IntegrationStatus;
    cash: IntegrationStatus;
    st: IntegrationStatus;
  }>({
    camera: { lastEvent: null, count: 0 },
    cash:   { lastEvent: null, count: 0 },
    st:     { lastEvent: null, count: 0 },
  });

  async function load() {
    setLoading(true);
    const [{ data: settings }, { data: people }, { data: cashEvents }, { data: batches }] =
      await Promise.all([
        supabase.from('settings').select('webhook_token').eq('establishment_id', establishmentId).single(),
        supabase.from('people_count_events').select('recorded_at').eq('establishment_id', establishmentId).order('recorded_at', { ascending: false }).limit(1),
        supabase.from('cash_payment_events').select('created_at').eq('establishment_id', establishmentId).order('created_at', { ascending: false }).limit(1),
        supabase.from('import_batches').select('created_at, source').eq('establishment_id', establishmentId).eq('imported_by', 'webhook-st-ingressos').order('created_at', { ascending: false }).limit(1),
      ]);

    setToken(settings?.webhook_token ?? '');

    const [{ count: peopleCount }, { count: cashCount }, { count: stCount }] = await Promise.all([
      supabase.from('people_count_events').select('*', { count: 'exact', head: true }).eq('establishment_id', establishmentId),
      supabase.from('cash_payment_events').select('*', { count: 'exact', head: true }).eq('establishment_id', establishmentId),
      supabase.from('import_batches').select('*', { count: 'exact', head: true }).eq('establishment_id', establishmentId).eq('imported_by', 'webhook-st-ingressos'),
    ]);

    setStatus({
      camera: { lastEvent: people?.[0]?.recorded_at ?? null, count: peopleCount ?? 0 },
      cash:   { lastEvent: cashEvents?.[0]?.created_at ?? null, count: cashCount ?? 0 },
      st:     { lastEvent: batches?.[0]?.created_at ?? null, count: stCount ?? 0 },
    });

    setLoading(false);
  }

  async function regenerateToken() {
    setRegenerating(true);
    const newToken = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    await supabase.from('settings').update({ webhook_token: newToken }).eq('establishment_id', establishmentId);
    await auditService.log({
      eventType: 'webhook_token.regenerated',
      targetType: 'settings',
      targetId: establishmentId,
      metadata: {
        token_preview: `${newToken.slice(0, 6)}...${newToken.slice(-4)}`,
      },
    });
    setToken(newToken);
    setRegenerating(false);
  }

  useEffect(() => { load(); }, []);

  const integrations = [
    {
      key: 'camera',
      label: 'Câmera Contagem de Pessoas',
      sublabel: 'ISAPI · ONVIF · Raspberry Pi',
      icon: Camera,
      color: 'text-primary',
      fn: 'webhook-camera',
      status: status.camera,
      payload: `// Use um camera_id diferente por câmera — o sistema soma
// automaticamente a leitura mais recente de cada uma.
//
// Câmera Área Principal → camera_id: "cam-area-01"
// Câmera Área Secundária → camera_id: "cam-area-02"

// Formato genérico ISAPI (configurado diretamente na câmera):
POST ${webhookUrl('webhook-camera')}
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "channelName": "cam-area-01",
  "dateTime": "2026-04-28T21:00:00Z",
  "peopleCounting": {
    "enter": 95,
    "exit": 10,
    "people": 85
  }
}

// Formato genérico:
{
  "camera_id": "cam-area-02",
  "count_in": 42,
  "count_out": 5,
  "people_inside": 37,
  "recorded_at": "2026-04-28T21:00:00Z"
}

// R01 dispara quando (cam-area-01 + cam-area-02) > threshold`,
    },
    {
      key: 'cash',
      label: 'Detecção de Espécie',
      sublabel: 'Raspberry Pi + OpenCV',
      icon: Banknote,
      color: 'text-warning',
      fn: 'webhook-cash',
      status: status.cash,
      payload: `// Payload enviado pelo Raspberry Pi ao detectar cédula:
POST ${webhookUrl('webhook-cash')}
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "camera_id": "cam-caixa",
  "detected_at": "2026-04-28T21:15:00Z",
  "confidence": 0.94,
  "window_minutes": 15
}

// confidence < 0.70 é ignorado automaticamente`,
    },
    {
      key: 'st',
      label: 'Sistema de Vendas / PDV',
      sublabel: 'Webhook · API · PDF / CSV',
      icon: ShoppingBag,
      color: 'text-success',
      fn: 'webhook-st-ingressos',
      status: status.st,
      payload: `// Payload por venda (ou array de vendas):
POST ${webhookUrl('webhook-st-ingressos')}
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "amount": 85.98,
  "payment_method": "debito",
  "operator_id": "op-marcos",
  "occurred_at": "2026-04-28T21:15:00Z"
}

// Métodos aceitos: credito, debito, pix, dinheiro
// Envio em lote: passar um array [ {...}, {...} ]`,
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-text uppercase tracking-tight">Integrações</h2>
          <p className="text-text-dim text-sm mt-1">Webhooks para câmeras IP, Raspberry Pi e sistema de vendas (PDV).</p>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-3 py-2 bg-surface-alt border border-border rounded text-[10px] uppercase font-black tracking-widest text-text-dim hover:text-text transition-colors disabled:opacity-50">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      {/* Token */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-[12px] uppercase font-black tracking-widest text-text">Token de Autenticação</h3>
            <p className="text-[11px] text-text-dim mt-1">Use este token no header <span className="font-mono text-primary">Authorization: Bearer ...</span> de todas as requisições.</p>
          </div>
          <button
            onClick={regenerateToken}
            disabled={regenerating}
            className="flex items-center gap-2 px-3 py-2 bg-danger/10 border border-danger/20 rounded text-[10px] uppercase font-black tracking-widest text-danger hover:bg-danger/20 transition-colors disabled:opacity-50"
          >
            {regenerating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Regenerar
          </button>
        </div>
        {loading ? (
          <div className="h-10 bg-surface-alt rounded animate-pulse" />
        ) : (
          <div className="flex items-center gap-2 bg-surface-alt border border-border rounded px-4 py-3">
            <code className="flex-1 font-mono text-sm text-primary break-all">{token || '—'}</code>
            {token && <CopyButton text={token} />}
          </div>
        )}
      </div>

      {/* Integrations */}
      <div className="space-y-4">
        {integrations.map(({ key, label, sublabel, icon: Icon, color, fn, status: s, payload }) => (
          <IntegrationCard
            key={key}
            label={label}
            sublabel={sublabel}
            icon={Icon}
            color={color}
            url={webhookUrl(fn)}
            token={token}
            status={s}
            payload={payload}
            loading={loading}
          />
        ))}
      </div>
    </div>
  );
}

interface CardProps {
  label: string;
  sublabel: string;
  icon: React.ElementType;
  color: string;
  url: string;
  token: string;
  status: IntegrationStatus;
  payload: string;
  loading: boolean;
}

function IntegrationCard({ label, sublabel, icon: Icon, color, url, token, status, payload, loading }: CardProps) {
  const [open, setOpen] = useState(false);
  const active = !!status.lastEvent;

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="p-5 flex items-center gap-4">
        <div className={cn('w-10 h-10 rounded flex items-center justify-center shrink-0 bg-surface-alt', color)}>
          <Icon size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-[13px] font-black text-text uppercase tracking-wide">{label}</p>
            <StatusBadge active={active} />
          </div>
          <p className="text-[11px] text-text-dim mt-0.5">{sublabel}</p>
          {!loading && active && (
            <p className="text-[10px] text-text-dim mt-1 font-mono">
              Último evento: {new Date(status.lastEvent!).toLocaleString('pt-BR')} · {status.count} total
            </p>
          )}
        </div>
        <button
          onClick={() => setOpen(v => !v)}
          className="shrink-0 text-[10px] uppercase font-black tracking-widest text-text-dim hover:text-text border border-border rounded px-3 py-1.5 hover:border-primary/40 transition-all"
        >
          {open ? 'Fechar' : 'Ver docs'}
        </button>
      </div>

      {open && (
        <div className="border-t border-border p-5 space-y-4 bg-surface-alt/30">
          {/* URL */}
          <div>
            <p className="text-[10px] uppercase font-black text-text-dim tracking-widest mb-2">Endpoint</p>
            <div className="flex items-center gap-2 bg-surface border border-border rounded px-3 py-2">
              <code className="flex-1 font-mono text-xs text-primary break-all">{url}</code>
              <CopyButton text={url} />
            </div>
          </div>

          {/* Payload */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase font-black text-text-dim tracking-widest">Payload</p>
              <CopyButton text={payload.replace(/{TOKEN}/g, token)} />
            </div>
            <pre className="bg-surface border border-border rounded p-4 font-mono text-[11px] text-text-dim overflow-auto max-h-64 leading-relaxed whitespace-pre-wrap">
              {payload.replace(/{TOKEN}/g, token || '{TOKEN}')}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
