// supabase/functions/agent-install/index.ts
// Endpoint público: valida token, entrega instalador com nome TOKEN_ correto.
// Windows  → proxy do OlhoVivoSetup.exe do GitHub Release
// Linux    → shell script gerado dinamicamente (baixa + instala + systemd)
// macOS    → shell script gerado dinamicamente (baixa + instala + launchd)
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GITHUB_BASE =
  "https://github.com/DevMachine2026/Sistema-Antifurto/releases/latest/download";

function safeToken(t: string | null): string | null {
  if (!t) return null;
  const s = t.trim();
  if (!s || s.length > 200 || !/^[a-zA-Z0-9-]+$/.test(s)) return null;
  return s;
}

function safeOs(o: string | null): "windows" | "linux" | "macos" {
  if (o === "linux") return "linux";
  if (o === "macos") return "macos";
  return "windows";
}

const _rl = new Map<string, { n: number; resetAt: number }>();
function rateLimit(req: Request): boolean {
  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const now = Date.now();
  const entry = _rl.get(ip);
  if (!entry || now > entry.resetAt) {
    _rl.set(ip, { n: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.n >= 15) return false;
  entry.n++;
  return true;
}

function makeShellScript(token: string, os: "linux" | "macos", anonKey: string): string {
  const archive = os === "linux" ? "OlhoVivoAgent-linux.tar.gz" : "OlhoVivoAgent-macos.tar.gz";
  const archiveUrl = `${GITHUB_BASE}/${archive}`;

  const dataDir = os === "linux"
    ? "$HOME/.local/share/OlhoVivoAgent"
    : "$HOME/Library/Application Support/OlhoVivoAgent";

  const installDir = os === "linux"
    ? "$HOME/.local/share/olhovivo-agent"
    : "$HOME/Library/Application Support/olhovivo-agent";

  const autostartBlock = os === "linux"
    ? `
# ── Autostart via systemd --user ────────────────────────────────────────────
if command -v systemctl &>/dev/null; then
  SERVICE_DIR="$HOME/.config/systemd/user"
  mkdir -p "$SERVICE_DIR"
  cat > "$SERVICE_DIR/olhovivo-agent.service" <<'SVCEOF'
[Unit]
Description=Olho Vivo Agent
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=INSTALL_DIR_PLACEHOLDER/olhovivo-agent
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
SVCEOF
  # substitui o placeholder pelo caminho real
  sed -i "s|INSTALL_DIR_PLACEHOLDER|$INSTALL_DIR|g" "$SERVICE_DIR/olhovivo-agent.service"
  systemctl --user daemon-reload
  systemctl --user enable olhovivo-agent.service
  systemctl --user start  olhovivo-agent.service
  echo ""
  echo "Serviço iniciado. Para verificar: systemctl --user status olhovivo-agent"
else
  echo "systemd não encontrado — inicie o agente manualmente: $INSTALL_DIR/olhovivo-agent"
fi`
    : `
# ── Autostart via launchd ────────────────────────────────────────────────────
PLIST_DIR="$HOME/Library/LaunchAgents"
LOG_PATH="$HOME/Library/Logs/olhovivo-agent.log"
mkdir -p "$PLIST_DIR"
cat > "$PLIST_DIR/com.olhovivo.agent.plist" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.olhovivo.agent</string>
  <key>ProgramArguments</key>
  <array><string>$INSTALL_DIR/olhovivo-agent</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG_PATH</string>
  <key>StandardErrorPath</key><string>$LOG_PATH</string>
</dict>
</plist>
PLISTEOF
launchctl load "$PLIST_DIR/com.olhovivo.agent.plist"
echo ""
echo "Agente iniciado via launchd. Log: $LOG_PATH"`;

  const openTerminalBlock = os === "linux"
    ? `
# Duplo clique no arquivo: abre uma janela e instala sem o cliente digitar comandos
if [ ! -t 0 ]; then
  if command -v x-terminal-emulator >/dev/null 2>&1; then
    exec x-terminal-emulator -e bash -lc "bash \\"$0\\"; echo; read -n 1 -s -r -p 'Pressione Enter para fechar...'"
  elif command -v gnome-terminal >/dev/null 2>&1; then
    exec gnome-terminal -- bash -lc "bash \\"$0\\"; echo; read -n 1 -s -r -p 'Pressione Enter para fechar...'"
  elif command -v konsole >/dev/null 2>&1; then
    exec konsole -e bash -lc "bash \\"$0\\"; echo; read -n 1 -s -r -p 'Pressione Enter para fechar...'"
  fi
fi
`
    : "";

  return `#!/usr/bin/env bash
# Olho Vivo Agent — Instalação automática (duplo clique em Downloads)
# Gerado em: $(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "n/a")
set -euo pipefail
chmod u+x "$0" 2>/dev/null || true
${openTerminalBlock}
TOKEN="${token}"
ARCHIVE_URL="${archiveUrl}"
INSTALL_DIR="${installDir}"
DATA_DIR="${dataDir}"
ANON_KEY="${anonKey}"

echo "========================================"
echo "  Olho Vivo Agent — Instalação"
echo "========================================"
echo ""

# ── Verificar curl ───────────────────────────────────────────────────────────
if ! command -v curl &>/dev/null; then
  echo "ERRO: curl não encontrado. Instale com: sudo apt install curl"
  exit 1
fi

# ── Download ─────────────────────────────────────────────────────────────────
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "Baixando agente..."
curl -sSL --progress-bar "$ARCHIVE_URL" -o "$TMP/agent.tar.gz"

# ── Instalar ─────────────────────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR"
tar xzf "$TMP/agent.tar.gz" -C "$INSTALL_DIR" --strip-components=1
chmod +x "$INSTALL_DIR/olhovivo-agent"
echo "Agente instalado em: $INSTALL_DIR"

# ── Configuração (.env) ──────────────────────────────────────────────────────
mkdir -p "$DATA_DIR"
ENV_FILE="$DATA_DIR/.olhovivo.env"
printf 'ESTABLISHMENT_TOKEN=%s\\n' "$TOKEN" > "$ENV_FILE"
if [ -n "$ANON_KEY" ]; then
  printf 'SUPABASE_ANON_KEY=%s\\n' "$ANON_KEY" >> "$ENV_FILE"
fi
echo "Configuração gravada em: $ENV_FILE"
${autostartBlock}

echo ""
echo "========================================"
echo "  Instalação concluída!"
echo "========================================"
if command -v zenity >/dev/null 2>&1; then
  zenity --info --title="Olho Vivo" --text="Instalação concluída!\\nO agente já está em execução." --width=340 2>/dev/null || true
elif command -v kdialog >/dev/null 2>&1; then
  kdialog --msgbox "Olho Vivo: instalação concluída!" 2>/dev/null || true
fi
`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "GET") return new Response("method_not_allowed", { status: 405, headers: CORS });
  if (!rateLimit(req)) return new Response("rate_limit_exceeded", { status: 429, headers: CORS });

  const url = new URL(req.url);
  const token = safeToken(url.searchParams.get("token"));
  if (!token) return new Response("token_obrigatorio_ou_invalido", { status: 400, headers: CORS });

  const os = safeOs(url.searchParams.get("os"));

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

  // ── Linux / macOS: gera script shell ──────────────────────────────────────
  if (os === "linux" || os === "macos") {
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const script = makeShellScript(token, os, anonKey);
    const headers = new Headers(CORS);
    const scriptName = os === "macos" ? "Instalar-Olho-Vivo.command" : "Instalar-Olho-Vivo.sh";
    headers.set("Content-Disposition", `attachment; filename="${scriptName}"`);
    headers.set(
      "Content-Type",
      "text/x-shellscript; charset=utf-8",
    );
    return new Response(script, { status: 200, headers });
  }

  // ── Windows: proxy do .exe no GitHub Release ───────────────────────────────
  let upstream: Response;
  try {
    upstream = await fetch(`${GITHUB_BASE}/OlhoVivoSetup.exe`, {
      headers: { "User-Agent": "OlhoVivo-install/1.0" },
    });
  } catch {
    return new Response("falha_ao_baixar_instalador", { status: 502, headers: CORS });
  }

  if (!upstream.ok) return new Response("origem_retornou_erro", { status: 502, headers: CORS });

  const headers = new Headers(CORS);
  headers.set("Content-Disposition", `attachment; filename="OlhoVivoSetup_TOKEN_${token}.exe"`);
  headers.set("Content-Type", "application/octet-stream");
  return new Response(upstream.body, { status: 200, headers });
});
