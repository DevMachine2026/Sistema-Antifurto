import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const GITHUB_BASE =
  "https://github.com/DevMachine2026/Sistema-Antifurto/releases/latest/download";

function windowsScript(token: string): string {
  return `
$ErrorActionPreference = "Stop"
$dest = "$env:LOCALAPPDATA\\OlhoVivo"
New-Item -ItemType Directory -Force -Path $dest | Out-Null

Write-Host "Baixando Olho Vivo Agent..." -ForegroundColor Cyan
$zip = "$dest\\agent.zip"
Invoke-WebRequest -Uri "${GITHUB_BASE}/olhovivo-agent-windows.zip" -OutFile $zip -UseBasicParsing
Expand-Archive -Path $zip -DestinationPath $dest -Force
Remove-Item $zip

$agentDir = "$dest\\olhovivo-agent"
[System.IO.File]::WriteAllText("$agentDir\\token.txt", "${token}")

# Atalho de inicialização automática
$startup = "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\\Startup"
$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut("$startup\\OlhoVivo.lnk")
$sc.TargetPath = "$agentDir\\olhovivo-agent.exe"
$sc.WorkingDirectory = $agentDir
$sc.WindowStyle = 7
$sc.Save()

# Inicia agora
Start-Process "$agentDir\\olhovivo-agent.exe" -WorkingDirectory $agentDir -WindowStyle Minimized

Write-Host ""
Write-Host "Olho Vivo instalado com sucesso!" -ForegroundColor Green
Write-Host "O agente ja esta rodando e inicia automaticamente com o Windows." -ForegroundColor Green
`.trimStart();
}

function linuxScript(token: string): string {
  return `#!/usr/bin/env bash
set -euo pipefail
DEST="$HOME/.olhovivo"
mkdir -p "$DEST"

echo "Baixando Olho Vivo Agent..."
curl -fsSL "${GITHUB_BASE}/olhovivo-agent-linux.zip" -o "$DEST/agent.zip"
unzip -o "$DEST/agent.zip" -d "$DEST"
rm "$DEST/agent.zip"
chmod +x "$DEST/olhovivo-agent/olhovivo-agent"

printf '%s' '${token}' > "$DEST/olhovivo-agent/token.txt"

if systemctl --user status > /dev/null 2>&1; then
  mkdir -p "$HOME/.config/systemd/user"
  cat > "$HOME/.config/systemd/user/olhovivo.service" <<UNIT
[Unit]
Description=Olho Vivo Agent
After=network-online.target

[Service]
ExecStart=$DEST/olhovivo-agent/olhovivo-agent
WorkingDirectory=$DEST/olhovivo-agent
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
UNIT
  systemctl --user daemon-reload
  systemctl --user enable olhovivo
  systemctl --user start olhovivo
else
  nohup "$DEST/olhovivo-agent/olhovivo-agent" > "$DEST/agent.log" 2>&1 &
  echo $! > "$DEST/agent.pid"
fi

echo ""
echo "Olho Vivo instalado com sucesso!"
echo "O agente ja esta rodando e inicia automaticamente com o sistema."
`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = new URL(req.url);
  const token = url.searchParams.get("token")?.trim();
  const platform = url.searchParams.get("platform");

  if (!token || !platform) {
    return new Response("token e platform sao obrigatorios", {
      status: 400,
      headers: CORS,
    });
  }

  if (platform !== "windows" && platform !== "linux") {
    return new Response("platform deve ser 'windows' ou 'linux'", {
      status: 400,
      headers: CORS,
    });
  }

  // Valida que o token existe
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
    return new Response("Token invalido ou agente inativo", {
      status: 404,
      headers: CORS,
    });
  }

  const script =
    platform === "windows" ? windowsScript(token) : linuxScript(token);

  const filename =
    platform === "windows" ? "instalar-olhovivo.ps1" : "instalar-olhovivo.sh";

  return new Response(script, {
    headers: {
      ...CORS,
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});
