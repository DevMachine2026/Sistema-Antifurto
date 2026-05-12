// supabase/functions/download-agent/index.ts
// Proxy autenticado: baixa OlhoVivoSetup.exe do GitHub e entrega com nome OlhoVivoSetup_TOKEN_<token>.exe
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
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return new Response("nao_autenticado", { status: 401, headers: cors });
  }

  const { data: agent, error: agentErr } = await supabase
    .from("agent_configs")
    .select("id")
    .eq("token", token)
    .eq("active", true)
    .maybeSingle();

  if (agentErr || !agent) {
    return new Response("agente_nao_encontrado_ou_sem_permissao", {
      status: 404,
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

  const filename = `OlhoVivoSetup_TOKEN_${token}.exe`;
  const headers = new Headers(cors);
  headers.set(
    "Content-Disposition",
    `attachment; filename="${filename}"`,
  );
  const ct = upstream.headers.get("Content-Type");
  if (ct) headers.set("Content-Type", ct);
  else headers.set("Content-Type", "application/octet-stream");

  return new Response(upstream.body, {
    status: 200,
    headers,
  });
});
