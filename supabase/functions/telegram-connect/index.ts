/**
 * Webhook do bot @sistemantifraude_bot.
 *
 * Fluxo:
 *   1. Admin gera link t.me/sistemantifraude_bot?start=WEBHOOK_TOKEN
 *   2. Cliente abre o link e clica Start no Telegram
 *   3. Telegram POST aqui com a mensagem "/start WEBHOOK_TOKEN"
 *   4. Buscamos o estabelecimento pelo webhook_token
 *   5. Salvamos o chat_id em settings
 *   6. Enviamos mensagem de confirmação ao cliente
 *
 * Registro do webhook (rodar uma vez):
 *   curl "https://api.telegram.org/botTOKEN/setWebhook?url=https://uoxcwvjtsebwmbsmyszj.supabase.co/functions/v1/telegram-connect"
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const BOT_USERNAME = "sistemantifraude_bot";

async function sendMessage(botToken: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // GET /telegram-connect?setup=1 — registra o webhook automaticamente
  if (req.method === "GET" && url.searchParams.get("setup") === "1") {
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
    const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/telegram-connect`;
    const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl }),
    });
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response("ok", { status: 200 });
  }

  let update: Record<string, unknown>;
  try {
    update = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const message = update.message as Record<string, unknown> | undefined;
  if (!message) return new Response("ok", { status: 200 });

  const text = (message.text as string | undefined) ?? "";
  const chat = message.chat as Record<string, unknown>;
  const chatId = chat.id as number;

  // Só processa /start TOKEN
  if (!text.startsWith("/start")) return new Response("ok", { status: 200 });

  const parts = text.trim().split(" ");
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
    return new Response("ok", { status: 200 });
  }

  // Busca o estabelecimento pelo webhook_token
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
    return new Response("ok", { status: 200 });
  }

  // Salva o chat_id
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
    `✅ <b>Olho Vivo conectado com sucesso${firstName ? `, ${firstName}` : ""}!</b>\n\nVocê vai receber alertas de fraude e movimentação do seu estabelecimento aqui. Nenhuma ação adicional é necessária.`,
  );

  return new Response("ok", { status: 200 });
});
