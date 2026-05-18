import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AlertRow {
  alert_type: string;
  severity: string;
  description: string;
}

async function postNotify(
  channel: string,
  url: string,
  init: RequestInit,
  establishmentId: string,
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return;
      console.warn(
        JSON.stringify({
          event: "notification_dispatch_failed",
          channel,
          establishment_id: establishmentId,
          status: res.status,
          attempt,
        }),
      );
    } catch (err) {
      console.warn(
        JSON.stringify({
          event: "notification_dispatch_failed",
          channel,
          establishment_id: establishmentId,
          attempt,
          error: String(err),
        }),
      );
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
}

export async function dispatchAlertNotifications(
  establishmentId: string,
  alerts: AlertRow[],
): Promise<void> {
  if (!alerts?.length) return;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const [settingsRes, estRes] = await Promise.all([
    supabase
      .from("settings")
      .select("telegram_chat_id, whatsapp_number")
      .eq("establishment_id", establishmentId)
      .single(),
    supabase.from("establishments").select("name").eq("id", establishmentId).single(),
  ]);

  const settings = settingsRes.data;
  if (!settings) return;

  const estName = estRes.data?.name ?? "Estabelecimento";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${serviceKey}`,
  };

  for (const alert of alerts) {
    const sev = String(alert.severity ?? "").toLowerCase();
    const emoji = sev === "high" || sev === "critical" ? "🚨" : "⚠️";
    const message =
      `${emoji} *Alerta Olho Vivo*\n\n*${estName}*\n\n${alert.description}\n\n` +
      `Tipo: \`${alert.alert_type}\`\nSeveridade: ${alert.severity}`;

    const tasks: Promise<void>[] = [];

    if (settings.telegram_chat_id) {
      tasks.push(
        postNotify(
          "telegram",
          `${supabaseUrl}/functions/v1/send-telegram`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ establishment_id: establishmentId, message }),
          },
          establishmentId,
        ),
      );
    }

    if (settings.whatsapp_number) {
      tasks.push(
        postNotify(
          "whatsapp",
          `${supabaseUrl}/functions/v1/send-whatsapp`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              establishment_id: establishmentId,
              number: settings.whatsapp_number,
              message,
            }),
          },
          establishmentId,
        ),
      );
    }

    await Promise.allSettled(tasks);
  }
}
