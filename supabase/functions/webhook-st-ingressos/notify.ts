// @ts-nocheck
/** Alert dispatch — colocado nesta pasta para deploy pelo dashboard Supabase (não envia ../_shared). */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface AlertRow {
  alert_type: string;
  severity: string;
  description: string;
}

export async function dispatchAlertNotifications(
  establishmentId: string,
  alerts: AlertRow[],
): Promise<void> {
  if (!alerts || alerts.length === 0) return;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const [settingsRes, estRes] = await Promise.all([
    supabase
      .from('settings')
      .select('telegram_chat_id, whatsapp_number')
      .eq('establishment_id', establishmentId)
      .single(),
    supabase
      .from('establishments')
      .select('name')
      .eq('id', establishmentId)
      .single(),
  ]);

  const settings = settingsRes.data;
  if (!settings) return;

  const estName = estRes.data?.name ?? 'Estabelecimento';
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  for (const alert of alerts) {
    const sev = String(alert.severity ?? '').toLowerCase();
    const emoji =
      sev === 'high' || sev === 'critical' ? '🚨' : '⚠️';
    const message =
      `${emoji} *Alerta Olho Vivo*\n\n` +
      `*${estName}*\n\n` +
      `${alert.description}\n\n` +
      `Tipo: \`${alert.alert_type}\`\n` +
      `Severidade: ${alert.severity}`;

    const tasks: Promise<void>[] = [];

    if (settings.telegram_chat_id) {
      tasks.push(
        fetch(`${supabaseUrl}/functions/v1/send-telegram`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ establishment_id: establishmentId, message }),
        }).then(() => {}).catch(() => {}),
      );
    }

    if (settings.whatsapp_number) {
      tasks.push(
        fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            establishment_id: establishmentId,
            number: settings.whatsapp_number,
            message,
          }),
        }).then(() => {}).catch(() => {}),
      );
    }

    await Promise.allSettled(tasks);
  }
}
