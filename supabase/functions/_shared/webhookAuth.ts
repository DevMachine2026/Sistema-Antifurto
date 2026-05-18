/** Resolução de Bearer: webhook_token (settings) ou token do agente (agent_configs). */
export async function resolveEstablishmentId(
  supabase: { from: (t: string) => any },
  bearerToken: string,
): Promise<{ establishment_id: string } | null> {
  const { data: byWebhook } = await supabase
    .from("settings")
    .select("establishment_id")
    .eq("webhook_token", bearerToken)
    .maybeSingle();
  if (byWebhook?.establishment_id) return byWebhook;

  const { data: byAgent } = await supabase
    .from("agent_configs")
    .select("establishment_id")
    .eq("token", bearerToken)
    .eq("active", true)
    .maybeSingle();
  if (byAgent?.establishment_id) return { establishment_id: byAgent.establishment_id };

  return null;
}

/** Segmento seguro para paths no bucket evidence e camera_id. */
export function sanitizeCameraId(raw: unknown): string | null {
  const id = String(raw ?? "").trim();
  if (!id || id.length > 64) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  return id;
}
