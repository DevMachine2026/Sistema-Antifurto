/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Alert } from '../types';

/**
 * Serviço de Notificação "Zero API"
 * Utiliza as APIs nativas do navegador para Push e Deep Links para WhatsApp.
 */
class NotificationService {
  constructor() {
    this.requestPermission();
  }

  async requestPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }

  async sendWhatsAppAlert(alert: Alert) {
    const phone = "5585991993833"; // Número cadastrado para testes
    const message = `⚠️ *SISTEMA ANTIFRAUDE*\n\n*ALERTA:* ${alert.description}\n*HORA:* ${new Date(alert.createdAt).toLocaleTimeString()}\n\n_Verifique o dashboard imediatamente._`;
    
    // 1. Dispara Notificação Push Nativa no Navegador (Mobile/Desktop)
    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification('⚠️ ALERTA DE FRAUDE', {
        body: alert.description,
        icon: '/favicon.ico',
        tag: alert.id,
        requireInteraction: true
      });

      // Ao clicar na notificação, abre o WhatsApp com a mensagem pronta
      notification.onclick = () => {
        const whatsappUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
      };
    }

    // 2. Log para auditoria interna
    console.log(`[PUSH_LOCAL] Alerta gerado para ${phone}: ${alert.type}`);
  }

  // Gera o link para uso manual nos cards de alerta
  getWhatsAppLink(alert: Alert) {
    const phone = "5585991993833";
    const message = `⚠️ *AUDITORIA REALIZADA*\n\n*ALERTA:* ${alert.description}\n*STATUS:* RESOLVIDO\n*RESPONSÁVEL:* Eduardo`;
    return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
  }
}

export const notificationService = new NotificationService();
