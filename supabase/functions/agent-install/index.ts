import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = new URL(req.url);
  const token = url.searchParams.get("token")?.trim();

  if (!token) {
    return new Response("token obrigatorio", { status: 400, headers: CORS });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase
    .from("agent_configs")
    .select("id")
    .eq("token", token)
    .eq("active", true)
    .single();

  if (error || !data) {
    return new Response("Token invalido ou agente inativo", { status: 404, headers: CORS });
  }

  return new Response(token, {
    headers: {
      ...CORS,
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": 'attachment; filename="token.txt"',
    },
  });
});
