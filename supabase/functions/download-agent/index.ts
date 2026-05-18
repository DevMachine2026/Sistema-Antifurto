// supabase/functions/download-agent/index.ts
// Proxy autenticado: baixa OlhoVivoSetup.exe do GitHub (nome genérico, sem token no filename)
// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function safeTokenFilename(token: string): string | null {
  const t = token.trim();
  if (!t || t.length > 200) return null;
  if (!/^[a-zA-Z0-9-]+$/.test(t)) return null;
  return t;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }
  if (req.method !== "GET") {
    return new Response("method_not_allowed", { status: 405, headers: cors });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(authHeader)) {
    return new Response("missing_or_invalid_authorization", {
      status: 401,
      headers: cors,
    });
  }

  const url = new URL(req.url);
  const rawToken = url.searchParams.get("token");
  const token = safeTokenFilename(rawToken ?? "");
  if (!token) {
    return new Response("token_obrigatorio_ou_invalido", {
      status: 400,
      headers: cors,
    });
  }

  const installerUrl = (Deno.env.get("GITHUB_AGENT_INSTALLER_URL") ?? "").trim();
  if (!installerUrl) {
    console.error("download-agent: GITHUB_AGENT_INSTALLER_URL nao configurada");
    return new Response("configuracao_servidor_incompleta", {
      status: 500,
      headers: cors,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) {
    return new Response("nao_autenticado", { status: 401, headers: cors });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: agent, error: agentErr } = await admin
    .from("agent_configs")
    .select("id, establishment_id")
    .eq("token", token)
    .eq("active", true)
    .maybeSingle();

  if (agentErr || !agent) {
    return new Response("agente_nao_encontrado_ou_sem_permissao", {
      status: 404,
      headers: cors,
    });
  }

  const { data: membership } = await admin
    .from("user_establishments")
    .select("establishment_id")
    .eq("user_id", user.id)
    .eq("establishment_id", agent.establishment_id)
    .eq("active", true)
    .maybeSingle();

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const isAdmin = profile?.role === "platform_admin";
  if (!membership && !isAdmin) {
    return new Response("sem_permissao_para_este_agente", {
      status: 403,
      headers: cors,
    });
  }

  let upstream: Response;
  try {
    upstream = await fetch(installerUrl, {
      headers: { "User-Agent": "OlhoVivo-download-agent/1.0" },
    });
  } catch (e) {
    console.error("download-agent: fetch github falhou", e);
    return new Response("falha_ao_baixar_instalador_origem", {
      status: 502,
      headers: cors,
    });
  }

  if (!upstream.ok) {
    console.error(
      "download-agent: github status",
      upstream.status,
      await upstream.text().catch(() => ""),
    );
    return new Response("origem_retornou_erro", { status: 502, headers: cors });
  }

  const headers = new Headers(cors);
  headers.set("Content-Disposition", 'attachment; filename="OlhoVivoSetup.exe"');
  const ct = upstream.headers.get("Content-Type");
  if (ct) headers.set("Content-Type", ct);
  else headers.set("Content-Type", "application/octet-stream");

  return new Response(upstream.body, {
    status: 200,
    headers,
  });
});
