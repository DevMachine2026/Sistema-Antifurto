/** Só Edge Functions internas (service_role) podem invocar send-telegram / send-whatsapp. */
export function isServiceRoleRequest(req: Request): boolean {
  const expected = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!expected) return false;

  const auth = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return !!token && token === expected;
}
