import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function getUserFromRequest(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
) {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(authHeader)) {
    return { error: "unauthorized" as const, status: 401 };
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return { error: "unauthorized" as const, status: 401 };
  return { user, authHeader };
}

export async function assertEstablishmentAccess(
  admin: SupabaseClient,
  userId: string,
  establishmentId: string,
): Promise<{ ok: true } | { error: string; status: number }> {
  const { data: membership } = await admin
    .from("user_establishments")
    .select("establishment_id")
    .eq("user_id", userId)
    .eq("establishment_id", establishmentId)
    .eq("active", true)
    .maybeSingle();

  if (membership?.establishment_id) return { ok: true };

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (profile?.role === "platform_admin") return { ok: true };

  return { error: "forbidden", status: 403 };
}
