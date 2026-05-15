// supabase/functions/agent-install/index.ts
// Endpoint público: valida token, faz proxy do instalador GitHub e entrega com nome TOKEN_ correto.
// Não exige JWT do usuário — qualquer um com um token válido e ativo pode baixar.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GITHUB_INSTALLER =
  "https://github.com/DevMachine2026/Sistema-Antifurto/releases/latest/download/OlhoVivoSetup.exe";

function safeToken(t: string | null): string | null {
  if (!t) return null;
  const s = t.trim();
  if (!s || s.length > 200 || !/^[a-zA-Z0-9-]+$/.test(s)) return null;
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "GET") return new Response("method_not_allowed", { status: 405, headers: CORS });

  const token = safeToken(new URL(req.url).searchParams.get("token"));
  if (!token) return new Response("token_obrigatorio_ou_invalido", { status: 400, headers: CORS });

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

  if (error || !data) return new Response("token_invalido_ou_agente_inativo", { status: 404, headers: CORS });

  let upstream: Response;
  try {
    upstream = await fetch(GITHUB_INSTALLER, { headers: { "User-Agent": "OlhoVivo-install/1.0" } });
  } catch {
    return new Response("falha_ao_baixar_instalador", { status: 502, headers: CORS });
  }

  if (!upstream.ok) return new Response("origem_retornou_erro", { status: 502, headers: CORS });

  const headers = new Headers(CORS);
  headers.set("Content-Disposition", `attachment; filename="OlhoVivoSetup_TOKEN_${token}.exe"`);
  headers.set("Content-Type", "application/octet-stream");

  return new Response(upstream.body, { status: 200, headers });
});
