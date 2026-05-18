/**
 * Webhook do bot @sistemantifraude_bot.
 *
 * Fluxo:
 *   1. Admin gera link t.me/sistemantifraude_bot?start=WEBHOOK_TOKEN
 *   2. Cliente abre o link e clica Start no Telegram
 *   3. Telegram POST aqui com a mensagem "/start WEBHOOK_TOKEN"
 *   4. Buscamos o estabelecimento pelo webhook_token
 *   5. Salvamos o chat_id em settings
 *
 * Secrets (Supabase → Edge Functions):
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_WEBHOOK_SECRET — validado em todo POST (header X-Telegram-Bot-Api-Secret-Token)
 *   TELEGRAM_SETUP_SECRET — GET ?setup=1 (registrar webhook no Telegram)
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-setup-secret, x-telegram-bot-api-secret-token",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(typeof data === "string" ? data : JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const _rl = new Map<string, { n: number; resetAt: number }>();
function rateLimitPost(req: Request, maxPerMin = 30): boolean {
  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const now = Date.now();
  const entry = _rl.get(ip);
  if (!entry || now > entry.resetAt) {
    _rl.set(ip, { n: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.n >= maxPerMin) return false;
  entry.n++;
  return true;
}

async function sendMessage(botToken: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

async function isPlatformAdmin(
  supabaseUrl: string,
  anonKey: string,
  authHeader: string,
): Promise<boolean> {
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await client.auth.getUser();
  if (!user) return false;
  const { data: profile } = await client
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  return profile?.role === "platform_admin";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const url = new URL(req.url);

  if (req.method === "GET" && url.searchParams.get("setup") === "1") {
    const setupSecret = Deno.env.get("TELEGRAM_SETUP_SECRET")?.trim();
    const provided = req.headers.get("x-setup-secret")?.trim();
    const authHeader = req.headers.get("Authorization") ?? "";
    const adminOk = setupSecret && provided === setupSecret;
    const jwtAdminOk = authHeader.startsWith("Bearer ") &&
      await isPlatformAdmin(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        authHeader,
      );
    if (!adminOk && !jwtAdminOk) {
      return jsonResponse({ ok: false, error: "unauthorized" }, 401);
    }

    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
    const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET")?.trim();
    const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/telegram-connect`;
    const body: Record<string, string> = { url: webhookUrl };
    if (webhookSecret) body.secret_token = webhookSecret;

    const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return jsonResponse(data);
  }

  if (req.method !== "POST") {
    return new Response("ok", { status: 200, headers: cors });
  }

  const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET")?.trim();
  if (webhookSecret) {
    const header = req.headers.get("X-Telegram-Bot-Api-Secret-Token")?.trim();
    if (header !== webhookSecret) {
      return new Response("unauthorized", { status: 401, headers: cors });
    }
  }

  if (!rateLimitPost(req)) {
    return new Response("rate_limit_exceeded", { status: 429, headers: cors });
  }

  let update: Record<string, unknown>;
  try {
    update = await req.json();
  } catch {
    return new Response("bad json", { status: 400, headers: cors });
  }

  const message = update.message as Record<string, unknown> | undefined;
  if (!message) return new Response("ok", { status: 200, headers: cors });

  const text = (message.text as string | undefined) ?? "";
  const chat = message.chat as Record<string, unknown>;
  const chatId = chat.id as number;

  if (!text.startsWith("/start")) return new Response("ok", { status: 200, headers: cors });

  const parts = text.trim().split(/\s+/);
  const webhookToken = parts[1]?.trim();

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (!webhookToken) {
    await sendMessage(
      botToken,
      chatId,
      "Olá! Para conectar seu estabelecimento, acesse o painel Olho Vivo → Configurações e clique em <b>Conectar Telegram</b>.",
    );
    return new Response("ok", { status: 200, headers: cors });
  }

  const { data: settings, error } = await supabase
    .from("settings")
    .select("establishment_id")
    .eq("webhook_token", webhookToken)
    .single();

  if (error || !settings) {
    await sendMessage(
      botToken,
      chatId,
      "Link inválido ou expirado. Gere um novo link no painel Olho Vivo → Configurações.",
    );
    return new Response("ok", { status: 200, headers: cors });
  }

  await supabase
    .from("settings")
    .update({ telegram_chat_id: String(chatId) })
    .eq("establishment_id", settings.establishment_id);

  const firstName = (
    (message.from as Record<string, unknown>)?.first_name as string
  ) ?? "";

  await sendMessage(
    botToken,
    chatId,
    `✅ <b>Olho Vivo conectado com sucesso${firstName ? `, ${firstName}` : ""}!</b>\n\nVocê vai receber alertas de fraude e movimentação do seu estabelecimento aqui.`,
  );

  return new Response("ok", { status: 200, headers: cors });
});
