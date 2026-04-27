import { Alert } from '../types';
import { supabase } from '../lib/supabase';

const ESTABLISHMENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

interface NotifConfig {
  whatsapp_number:   string | null;
  telegram_bot_token: string | null;
  telegram_chat_id:   string | null;
}

class NotificationService {
  private cache: NotifConfig | null = null;

  constructor() {
    this.requestPermission();
  }

  async requestPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }

  clearCache() {
    this.cache = null;
  }

  private async getConfig(): Promise<NotifConfig> {
    if (this.cache) return this.cache;
    const { data } = await supabase
      .from('settings')
      .select('whatsapp_number, telegram_bot_token, telegram_chat_id')
      .eq('establishment_id', ESTABLISHMENT_ID)
      .single();
    this.cache = {
      whatsapp_number:    data?.whatsapp_number    ?? null,
      telegram_bot_token: data?.telegram_bot_token ?? null,
      telegram_chat_id:   data?.telegram_chat_id   ?? null,
    };
    return this.cache;
  }

  async sendAlert(alert: Alert, configOverride?: Partial<NotifConfig>) {
    const config = { ...(await this.getConfig()), ...configOverride };

    const text =
      `⚠️ *ALERTA DE FRAUDE*\n\n` +
      `*Tipo:* ${alert.type.toUpperCase()}\n` +
      `*Severidade:* ${alert.severity === 'high' ? '🔴 CRÍTICA' : '🟡 MÉDIA'}\n` +
      `*Detalhe:* ${alert.description}\n` +
      `*Hora:* ${new Date(alert.createdAt).toLocaleTimeString('pt-br')}\n\n` +
      `_Acesse o dashboard para auditar._`;

    // ── Canal 1: Telegram (automático, sem interação) ──────────
    if (config.telegram_bot_token && config.telegram_chat_id) {
      try {
        const res = await fetch(
          `https://api.telegram.org/bot${config.telegram_bot_token}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id:    config.telegram_chat_id,
              text,
              parse_mode: 'Markdown',
            }),
          }
        );
        if (res.ok) {
          console.log(`[TELEGRAM] Alerta enviado: ${alert.type}`);
        } else {
          const err = await res.json();
          console.error('[TELEGRAM] Erro:', err.description);
        }
      } catch (e) {
        console.error('[TELEGRAM] Falha na requisição:', e);
      }
    }

    // ── Canal 2: Push nativo + deep link WhatsApp (requer clique) ─
    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification('⚠️ ALERTA DE FRAUDE', {
        body: alert.description,
        icon: '/favicon.svg',
        tag: alert.id,
        requireInteraction: true,
      });

      if (config.whatsapp_number) {
        const waMsg = encodeURIComponent(text.replace(/\*/g, '*').replace(/_/g, ''));
        notification.onclick = () =>
          window.open(`https://api.whatsapp.com/send?phone=${config.whatsapp_number}&text=${waMsg}`, '_blank');
      }
    }

    if (!config.telegram_bot_token && !config.whatsapp_number) {
      console.warn('[NOTIF] Nenhum canal configurado. Configure em Configurações.');
    }
  }

  // Mantém compatibilidade com chamadas existentes
  async sendWhatsAppAlert(alert: Alert, phoneOverride?: string) {
    await this.sendAlert(alert, phoneOverride ? { whatsapp_number: phoneOverride } : undefined);
  }

  getWhatsAppLink(alert: Alert): string {
    const phone = this.cache?.whatsapp_number ?? '';
    const msg = `⚠️ *AUDITORIA REALIZADA*\n\n*ALERTA:* ${alert.description}\n*STATUS:* RESOLVIDO`;
    return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`;
  }
}

export const notificationService = new NotificationService();
