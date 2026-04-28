import { useState, useEffect } from 'react';
import { Shield, Bell, Database, Megaphone, Save, Loader2, CheckCircle2, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCurrentEstablishmentId } from '../lib/tenant';
import { notificationService } from '../services/notificationService';
import { auditService } from '../services/auditService';
import { cn } from '../lib/utils';

interface SettingsData {
  whatsapp_number: string;
  telegram_bot_token: string;
  telegram_chat_id: string;
  r01_min_people: number;
  r01_window_minutes: number;
  r02_gap_threshold: number;
  strict_audit_mode: boolean;
  monitoring_start_time: string;
  monitoring_end_time: string;
}

const DEFAULTS: SettingsData = {
  whatsapp_number: '',
  telegram_bot_token: '',
  telegram_chat_id: '',
  r01_min_people: 30,
  r01_window_minutes: 30,
  r02_gap_threshold: 200,
  strict_audit_mode: false,
  monitoring_start_time: '18:00',
  monitoring_end_time: '04:00',
};

export default function Settings() {
  const establishmentId = getCurrentEstablishmentId();
  const [form, setForm] = useState<SettingsData>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('settings')
        .select('*')
        .eq('establishment_id', establishmentId)
        .single();

      if (data) {
        setForm({
          whatsapp_number:       data.whatsapp_number       ?? '',
          telegram_bot_token:    data.telegram_bot_token    ?? '',
          telegram_chat_id:      data.telegram_chat_id      ?? '',
          r01_min_people:        data.r01_min_people,
          r01_window_minutes:    data.r01_window_minutes,
          r02_gap_threshold:     Number(data.r02_gap_threshold),
          strict_audit_mode:     data.strict_audit_mode,
          monitoring_start_time: data.monitoring_start_time?.slice(0, 5) ?? '18:00',
          monitoring_end_time:   data.monitoring_end_time?.slice(0, 5)   ?? '04:00',
        });
      }
      setLoading(false);
    }
    load();
  }, []);

  function set<K extends keyof SettingsData>(key: K, value: SettingsData[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from('settings')
      .update({
        whatsapp_number:       form.whatsapp_number    || null,
        telegram_bot_token:    form.telegram_bot_token || null,
        telegram_chat_id:      form.telegram_chat_id   || null,
        r01_min_people:        form.r01_min_people,
        r01_window_minutes:    form.r01_window_minutes,
        r02_gap_threshold:     form.r02_gap_threshold,
        strict_audit_mode:     form.strict_audit_mode,
        monitoring_start_time: form.monitoring_start_time,
        monitoring_end_time:   form.monitoring_end_time,
      })
      .eq('establishment_id', establishmentId);

    setSaving(false);
    if (!error) {
      await auditService.log({
        eventType: 'settings.updated',
        targetType: 'settings',
        targetId: establishmentId,
        metadata: {
          r01_min_people: form.r01_min_people,
          r01_window_minutes: form.r01_window_minutes,
          r02_gap_threshold: form.r02_gap_threshold,
          strict_audit_mode: form.strict_audit_mode,
          monitoring_start_time: form.monitoring_start_time,
          monitoring_end_time: form.monitoring_end_time,
          has_whatsapp: !!form.whatsapp_number,
          has_telegram: !!(form.telegram_bot_token && form.telegram_chat_id),
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  }

  async function testNotification() {
    setTesting(true);
    setTestResult(null);

    // Testa Telegram diretamente para ter feedback imediato
    if (form.telegram_bot_token && form.telegram_chat_id) {
      try {
        const res = await fetch(
          `https://api.telegram.org/bot${form.telegram_bot_token}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: form.telegram_chat_id,
              text: '✅ *SISTEMA ANTIFRAUDE — TESTE*\n\nNotificação funcionando corretamente!\n\n_Dev Machine_',
              parse_mode: 'Markdown',
            }),
          }
        );
        const json = await res.json();
        if (json.ok) {
          setTestResult({ ok: true, msg: 'Mensagem enviada no Telegram!' });
        } else {
          setTestResult({ ok: false, msg: `Telegram erro: ${json.description}` });
        }
      } catch (e: any) {
        setTestResult({ ok: false, msg: `Falha na requisição: ${e.message}` });
      }
    } else if (form.whatsapp_number) {
      // Fallback: push nativo + link WhatsApp
      await notificationService.requestPermission();
      await notificationService.sendAlert({
        id: crypto.randomUUID(),
        type: 'card_gap',
        severity: 'high',
        description: 'TESTE: Divergência de R$ 528,82 entre PagBank e Bilheteria.',
        context: {},
        resolved: false,
        createdAt: new Date().toISOString(),
      }, { whatsapp_number: form.whatsapp_number });
      setTestResult({ ok: true, msg: 'Push disparado — clique na notificação do navegador para abrir o WhatsApp.' });
    } else {
      setTestResult({ ok: false, msg: 'Configure ao menos o Telegram ou o WhatsApp antes de testar.' });
    }

    setTesting(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="animate-spin text-text-dim" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-text uppercase tracking-tight">Configurações</h2>
          <p className="text-text-dim text-sm font-medium">Thresholds do motor de regras e notificações.</p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded font-black text-[11px] uppercase tracking-widest hover:bg-primary/90 transition-all disabled:opacity-50 shadow-lg shadow-primary/20"
        >
          {saving ? <Loader2 size={14} className="animate-spin" />
            : saved ? <CheckCircle2 size={14} />
              : <Save size={14} />}
          {saved ? 'Salvo!' : 'Salvar'}
        </button>
      </div>

      {/* WhatsApp */}
      <Section icon={Bell} title="Notificações WhatsApp" color="success">
        <p className="text-text-dim text-xs mb-4 leading-relaxed">
          Alertas críticos disparam uma notificação push no navegador. Ao clicar, o WhatsApp abre com a mensagem pronta para o número abaixo.
        </p>
        <div className="space-y-3">
          <label className="block">
            <span className="text-[10px] uppercase font-black text-text-dim tracking-widest block mb-1.5">
              Número WhatsApp (com DDD e código do país)
            </span>
            <div className="flex gap-2">
              <input
                type="tel"
                value={form.whatsapp_number}
                onChange={e => {
                  let v = e.target.value.replace(/\D/g, '');
                  if (v.length > 0 && !v.startsWith('55')) v = '55' + v;
                  set('whatsapp_number', v);
                }}
                placeholder="5585999990000"
                className="flex-1 min-w-0 bg-surface-alt border border-border rounded px-3 py-2.5 text-text font-mono text-sm focus:outline-none focus:border-primary transition-colors"
              />
              <button
                onClick={testNotification}
                disabled={testing || !form.whatsapp_number}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 bg-success/10 border border-success/30 text-success rounded font-black text-[10px] uppercase tracking-widest hover:bg-success/20 transition-all disabled:opacity-40"
              >
                {testing ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                Testar
              </button>
            </div>
            <p className="text-[10px] text-text-dim mt-1.5">Ex: 5585991993833 (55 = Brasil, 85 = Fortaleza)</p>
          </label>
        </div>
      </Section>

      {/* Telegram */}
      <Section icon={Send} title="Notificações Telegram (Automático)" color="primary">
        <p className="text-text-dim text-xs mb-4 leading-relaxed">
          Envio automático — a mensagem chega no Telegram sem nenhum clique.
          Crie um bot em <strong className="text-text">@BotFather</strong> e cole as credenciais abaixo.
        </p>
        <div className="space-y-3">
          <label className="block">
            <span className="text-[10px] uppercase font-black text-text-dim tracking-widest block mb-1.5">
              Bot Token (do @BotFather)
            </span>
            <input
              type="text"
              value={form.telegram_bot_token}
              onChange={e => set('telegram_bot_token', e.target.value.trim())}
              placeholder="1234567890:AAF..."
              className="w-full bg-surface-alt border border-border rounded px-4 py-2.5 text-text font-mono text-sm focus:outline-none focus:border-primary transition-colors"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase font-black text-text-dim tracking-widest block mb-1.5">
              Chat ID (seu ID no Telegram)
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.telegram_chat_id}
                onChange={e => set('telegram_chat_id', e.target.value.trim())}
                placeholder="123456789"
                className="flex-1 min-w-0 bg-surface-alt border border-border rounded px-3 py-2.5 text-text font-mono text-sm focus:outline-none focus:border-primary transition-colors"
              />
              <button
                onClick={testNotification}
                disabled={testing || !form.telegram_bot_token || !form.telegram_chat_id}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 bg-primary/10 border border-primary/30 text-primary rounded font-black text-[10px] uppercase tracking-widest hover:bg-primary/20 transition-all disabled:opacity-40"
              >
                {testing ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                Testar
              </button>
            </div>
            <p className="text-[10px] text-text-dim mt-1.5">
              Para obter: envie qualquer mensagem ao seu bot e acesse
              <span className="font-mono text-primary"> api.telegram.org/bot&#123;TOKEN&#125;/getUpdates</span>
            </p>
          </label>
        {testResult && (
          <div className={cn(
            "mt-3 px-4 py-3 rounded border text-[12px] font-bold flex items-center gap-2",
            testResult.ok
              ? "bg-success/10 border-success/30 text-success"
              : "bg-danger/10 border-danger/30 text-danger"
          )}>
            {testResult.ok ? <CheckCircle2 size={14} /> : <Send size={14} />}
            {testResult.msg}
          </div>
        )}
        </div>
      </Section>

      {/* Regra R01 */}
      <Section icon={Database} title="Regra R01 — Salão Cheio, Caixa Vazio" color="warning">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-[10px] uppercase font-black text-text-dim tracking-widest block mb-1.5">
              Mínimo de pessoas para ativar
            </span>
            <div className="flex items-center gap-3">
              <input
                type="range" min={10} max={100} value={form.r01_min_people}
                onChange={e => set('r01_min_people', Number(e.target.value))}
                className="flex-1 accent-warning"
              />
              <span className="font-mono font-black text-warning w-10 text-right">{form.r01_min_people}</span>
            </div>
          </label>
          <label className="block">
            <span className="text-[10px] uppercase font-black text-text-dim tracking-widest block mb-1.5">
              Janela sem vendas (minutos)
            </span>
            <div className="flex items-center gap-3">
              <input
                type="range" min={10} max={120} step={5} value={form.r01_window_minutes}
                onChange={e => set('r01_window_minutes', Number(e.target.value))}
                className="flex-1 accent-warning"
              />
              <span className="font-mono font-black text-warning w-10 text-right">{form.r01_window_minutes}m</span>
            </div>
          </label>
        </div>
      </Section>

      {/* Regra R02 */}
      <Section icon={Shield} title="Regra R02 — Gap Financeiro" color="danger">
        <label className="block">
          <span className="text-[10px] uppercase font-black text-text-dim tracking-widest block mb-1.5">
            Threshold de divergência (R$)
          </span>
          <div className="flex items-center gap-3">
            <input
              type="range" min={50} max={2000} step={50} value={form.r02_gap_threshold}
              onChange={e => set('r02_gap_threshold', Number(e.target.value))}
              className="flex-1 accent-danger"
            />
            <span className="font-mono font-black text-danger w-24 text-right">
              R$ {form.r02_gap_threshold.toFixed(2)}
            </span>
          </div>
          <p className="text-[10px] text-text-dim mt-1.5">
            Alerta dispara quando diferença entre PagBank e ST Ingressos ultrapassar este valor.
          </p>
        </label>
      </Section>

      {/* Horário de monitoramento */}
      <Section icon={Megaphone} title="Janela de Monitoramento" color="primary">
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-[10px] uppercase font-black text-text-dim tracking-widest block mb-1.5">Início</span>
            <input
              type="time" value={form.monitoring_start_time}
              onChange={e => set('monitoring_start_time', e.target.value)}
              className="w-full bg-surface-alt border border-border rounded px-4 py-2.5 text-text font-mono text-sm focus:outline-none focus:border-primary transition-colors"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase font-black text-text-dim tracking-widest block mb-1.5">Fim</span>
            <input
              type="time" value={form.monitoring_end_time}
              onChange={e => set('monitoring_end_time', e.target.value)}
              className="w-full bg-surface-alt border border-border rounded px-4 py-2.5 text-text font-mono text-sm focus:outline-none focus:border-primary transition-colors"
            />
          </label>
        </div>
        <p className="text-[10px] text-text-dim mt-3">Fora desta janela o motor ainda roda, mas com menor prioridade.</p>
      </Section>

      {/* Modo estrito */}
      <div className={cn(
        "bg-surface p-6 rounded-lg border flex gap-5 transition-all",
        form.strict_audit_mode ? "border-warning/50 bg-warning/5" : "border-border"
      )}>
        <div className={cn(
          "w-12 h-12 rounded flex items-center justify-center shrink-0 transition-all",
          form.strict_audit_mode ? "bg-warning text-white shadow-[0_0_15px_rgba(245,158,11,0.3)]" : "bg-surface-alt text-text-dim"
        )}>
          <Shield size={24} />
        </div>
        <div className="flex-1">
          <h4 className="font-bold text-text uppercase text-sm tracking-tight">Modo Auditoria Estrita</h4>
          <p className="text-xs text-text-dim mt-2 leading-relaxed">
            Aumenta a sensibilidade das regras. Recomendado para eventos com alta densidade (500+ pessoas).
          </p>
          <button
            onClick={() => set('strict_audit_mode', !form.strict_audit_mode)}
            className={cn(
              "mt-4 px-5 py-2 rounded font-black text-[10px] uppercase tracking-widest transition-all",
              form.strict_audit_mode
                ? "bg-warning text-white hover:bg-warning/90 shadow-lg shadow-warning/20"
                : "bg-surface-alt border border-border text-text-dim hover:text-text"
            )}
          >
            {form.strict_audit_mode ? 'Ativo — Clique para Desativar' : 'Ativar Sensibilidade Máxima'}
          </button>
        </div>
      </div>

      <div className="pt-4 border-t border-border/30 text-center">
        <p className="text-xs text-text-dim">
          Sistema desenvolvido por <span className="text-primary font-semibold">Dev Machine</span>
          <span className="mx-2">·</span>Versão 1.0
        </p>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, color, children }: {
  icon: React.ElementType; title: string; color: string; children: React.ReactNode;
}) {
  const colorMap: Record<string, string> = {
    success: 'text-success border-success/20',
    warning: 'text-warning border-warning/20',
    danger:  'text-danger border-danger/20',
    primary: 'text-primary border-primary/20',
  };
  return (
    <div className="bg-surface rounded-lg border border-border p-6 shadow-sm">
      <div className={cn("flex items-center gap-2 mb-4 pb-3 border-b", colorMap[color] ?? 'text-text border-border')}>
        <Icon size={16} />
        <h3 className="text-[12px] uppercase font-black tracking-widest">{title}</h3>
      </div>
      {children}
    </div>
  );
}
