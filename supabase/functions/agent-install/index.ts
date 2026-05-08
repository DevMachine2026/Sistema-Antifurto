import { createClient } from "jsr:@supabase/supabase-js@2";
import { unzipSync, zipSync } from "npm:fflate@0.8.2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GITHUB_BASE =
  "https://github.com/DevMachine2026/Sistema-Antifurto/releases/latest/download";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = new URL(req.url);
  const token = url.searchParams.get("token")?.trim();
  const platform = (url.searchParams.get("platform") ?? "windows") as "windows" | "linux";

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

  const assetName = platform === "windows"
    ? "olhovivo-agent-windows.zip"
    : "olhovivo-agent-linux.zip";

  const ghRes = await fetch(`${GITHUB_BASE}/${assetName}`);
  if (!ghRes.ok) {
    return new Response("Release nao encontrada no GitHub", { status: 502, headers: CORS });
  }

  const zipBytes = new Uint8Array(await ghRes.arrayBuffer());
  const files = unzipSync(zipBytes);

  const encoder = new TextEncoder();
  files["olhovivo-agent/token.txt"] = encoder.encode(token);

  const newZip = zipSync(files, { level: 0 });

  return new Response(newZip, {
    headers: {
      ...CORS,
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="olhovivo-agent.zip"',
    },
  });
});
