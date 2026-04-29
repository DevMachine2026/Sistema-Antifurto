import { Alert } from '../types';
import { supabase } from '../lib/supabase';
import { getCurrentEstablishmentId } from '../lib/tenant';

interface NotifConfig {
  whatsapp_number:   string | null;
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
      .select('whatsapp_number, telegram_chat_id')
      .eq('establishment_id', getCurrentEstablishmentId())
      .single();
    this.cache = {
      whatsapp_number:    data?.whatsapp_number    ?? null,
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

    // ── Canal 1: Telegram (automático, via Edge Function segura) ──────────
    if (config.telegram_chat_id) {
      try {
        const { error } = await supabase.functions.invoke('send-telegram', {
          body: {
            establishment_id: getCurrentEstablishmentId(),
            message: text,
            chat_id: config.telegram_chat_id,
          },
        });
        if (!error) {
          console.log(`[TELEGRAM] Alerta enviado: ${alert.type}`);
        } else {
          console.error('[TELEGRAM] Erro ao invocar Edge Function:', error.message);
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

    if (!config.telegram_chat_id && !config.whatsapp_number) {
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
