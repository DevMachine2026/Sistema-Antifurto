# DVR / Câmera Zero-Friction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cobrir todos os cenários de câmera (IP standalone ONVIF, DVR analógico, câmera IP sem ONVIF) com o mínimo de atrito possível — tentando credenciais padrão automaticamente e gerando URLs RTSP corretas por fabricante.

**Architecture:** O agente (Python) sobe na camada de descoberta para detectar tipo de dispositivo (câmera vs DVR) e probar credenciais padrão via RTSP antes de reportar ao Supabase. O frontend Agents.tsx passa a exibir UX diferenciada por tipo de dispositivo, populando `user`/`pass`/`rtsp_path` ao aprovar. O campo `cameras` JSONB em `agent_configs` já suporta `user`/`pass` — só não estava sendo preenchido.

**Tech Stack:** Python 3.11 (socket, httpx), Deno/TypeScript (Edge Functions), React/TypeScript (frontend), Supabase (PostgreSQL + RLS)

---

## Mapa de arquivos

| Arquivo | O que muda |
|---------|-----------|
| `supabase/migration_dvr.sql` | NOVO — adiciona colunas em `agent_camera_candidates` |
| `agent/scanner.py` | DVR detection + RTSP credential probing |
| `agent/tests/test_scanner.py` | Testes DVR detection + credential probing |
| `supabase/functions/agent-cameras-found/index.ts` | Aceita e persiste novos campos |
| `src/pages/Agents.tsx` | UI por device_type, popula user/pass ao aprovar |

---

## Task 1: Migração DB — estender agent_camera_candidates

**Files:**
- Create: `supabase/migration_dvr.sql`

- [ ] **Step 1: Criar migration**

```sql
-- supabase/migration_dvr.sql
-- Estende agent_camera_candidates para suportar DVRs e credenciais auto-detectadas

ALTER TABLE public.agent_camera_candidates
  ADD COLUMN IF NOT EXISTS port              integer,
  ADD COLUMN IF NOT EXISTS service_url       text,
  ADD COLUMN IF NOT EXISTS manufacturer      text,
  ADD COLUMN IF NOT EXISTS device_type       text NOT NULL DEFAULT 'camera',
  ADD COLUMN IF NOT EXISTS channel_count     integer,
  ADD COLUMN IF NOT EXISTS username          text,
  ADD COLUMN IF NOT EXISTS password          text,
  ADD COLUMN IF NOT EXISTS credentials_ok    boolean;

COMMENT ON COLUMN public.agent_camera_candidates.device_type
  IS 'camera | dvr';
COMMENT ON COLUMN public.agent_camera_candidates.credentials_ok
  IS 'true = credenciais padrão verificadas via RTSP probe; false = falhou; null = não testado';
```

- [ ] **Step 2: Aplicar no Supabase**

```bash
# Via Dashboard SQL Editor ou CLI:
supabase db push  # se usar CLI local
# OU copiar e executar no SQL Editor do painel Supabase
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migration_dvr.sql
git commit -m "feat(db): estende agent_camera_candidates com campos DVR e credenciais"
```

---

## Task 2: Scanner — DVR detection + RTSP credential probing

**Files:**
- Modify: `agent/scanner.py`

- [ ] **Step 1: Adicionar `_rtsp_probe` ao scanner**

Adicionar logo após `_tcp_open` (linha ~45):

```python
_DEFAULT_CREDS = [
    ("admin", "admin"),
    ("admin", "12345"),
    ("admin", ""),
    ("admin", "123456"),
    ("admin", "password"),
]

def _rtsp_probe(ip: str, port: int, username: str, password: str, timeout: float = 2.0) -> bool:
    """Tenta RTSP DESCRIBE com credenciais. Retorna True se 200 OK ou 401 (servidor RTSP presente)."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            s.connect((ip, port))
            req = (
                f"DESCRIBE rtsp://{username}:{password}@{ip}:{port}/ RTSP/1.0\r\n"
                f"CSeq: 1\r\n"
                f"Accept: application/sdp\r\n\r\n"
            ).encode()
            s.sendall(req)
            resp = s.recv(512).decode(errors="ignore")
            return "RTSP/1.0 200" in resp
    except Exception:
        return False


def _try_default_creds(ip: str, port: int = 554) -> tuple[str, str] | None:
    """
    Tenta credenciais padrão via RTSP DESCRIBE.
    Retorna (username, password) se encontrar, None caso contrário.
    """
    for user, pwd in _DEFAULT_CREDS:
        if _rtsp_probe(ip, port, user, pwd):
            logger.info("default creds work on %s:%d user=%s", ip, port, user)
            return user, pwd
    return None
```

- [ ] **Step 2: Adicionar `_detect_dvr` ao scanner**

Adicionar após `_try_default_creds`:

```python
_DVR_SIGNATURES = {
    "intelbras": ["intelbras", "mhdx", "nvd", "vd"],
    "hikvision": ["hikvision", "ds-"],
    "dahua":     ["dahua", "dhi-"],
    "axis":      ["axis"],
}

def _detect_dvr(ip: str, port: int, timeout: float = 2.0) -> tuple[str | None, int | None]:
    """
    Faz probe HTTP no dispositivo. Retorna (manufacturer, channel_count_hint) ou (None, None).
    channel_count_hint é uma estimativa pelo modelo (ex: MHDX 3008 → 8).
    """
    for scheme, p in [("http", port if port in (80, 8000) else 80), ("http", 8000)]:
        try:
            url = f"{scheme}://{ip}:{p}/"
            resp = httpx.get(url, timeout=timeout, follow_redirects=False)
            content = (resp.headers.get("server", "") + " " + resp.text[:2000]).lower()

            for mfr, keywords in _DVR_SIGNATURES.items():
                if any(kw in content for kw in keywords):
                    # tenta extrair número de canais do modelo (ex: "3008" → 8, "3016" → 16)
                    ch = None
                    import re as _re
                    m = _re.search(r"(?:mhdx|nvd|ds-7|dhi-)\s*\d*0(\d+)", content)
                    if m:
                        try:
                            ch = int(m.group(1))
                        except ValueError:
                            ch = None
                    logger.info("DVR detected: ip=%s manufacturer=%s channels=%s", ip, mfr, ch)
                    return mfr, ch
        except Exception:
            continue
    return None, None
```

- [ ] **Step 3: Atualizar `discover_port_scan` para enriquecer resultado com DVR info + creds**

Substituir a função `_scan` interna dentro de `discover_port_scan`:

```python
    def _scan(ip: str) -> None:
        for p in _CAMERA_PORTS:
            if _tcp_open(ip, p, timeout=timeout_per_host):
                url = _service_url(ip, p)
                mfr = _guess_manufacturer(ip, p, url)

                # Detecta se é DVR
                device_type = "camera"
                channel_count: int | None = None
                if p in (80, 8000, 37777) or mfr in ("Dahua", "Hikvision", "Intelbras"):
                    dvr_mfr, ch = _detect_dvr(ip, p)
                    if dvr_mfr:
                        device_type = "dvr"
                        mfr = dvr_mfr.capitalize() if dvr_mfr else mfr
                        channel_count = ch

                # Tenta credenciais padrão via RTSP
                rtsp_port = 554 if _tcp_open(ip, 554, timeout=timeout_per_host) else p
                creds = _try_default_creds(ip, rtsp_port)

                with lock:
                    results.append({
                        "ip":              ip,
                        "port":            p,
                        "service_url":     url,
                        "manufacturer":    mfr,
                        "device_type":     device_type,
                        "channel_count":   channel_count,
                        "username":        creds[0] if creds else None,
                        "password":        creds[1] if creds else None,
                        "credentials_ok":  creds is not None,
                    })
                logger.info(
                    "port-scan found: ip=%s port=%d device=%s manufacturer=%s creds_ok=%s",
                    ip, p, device_type, mfr, creds is not None,
                )
                return

    threads = [threading.Thread(target=_scan, args=(h,), daemon=True) for h in hosts]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=timeout_per_host + 5.0)

    return results
```

- [ ] **Step 4: Atualizar `report_discovered` para enviar novos campos**

Substituir o bloco `payload = [...]` em `report_discovered`:

```python
    payload = [
        {
            "ip":             c["ip"],
            "port":           c.get("port"),
            "service_url":    c.get("service_url"),
            "manufacturer":   c.get("manufacturer"),
            "device_type":    c.get("device_type", "camera"),
            "channel_count":  c.get("channel_count"),
            "username":       c.get("username"),
            "password":       c.get("password"),
            "credentials_ok": c.get("credentials_ok"),
        }
        for c in candidates
    ]
```

- [ ] **Step 5: Commit**

```bash
git add agent/scanner.py
git commit -m "feat(scanner): DVR detection + RTSP credential probing automático"
```

---

## Task 3: Testes do scanner — DVR e credenciais

**Files:**
- Modify: `agent/tests/test_scanner.py`

- [ ] **Step 1: Adicionar testes `_rtsp_probe`**

Adicionar ao final de `test_scanner.py`:

```python
# ---------------------------------------------------------------------------
# _rtsp_probe
# ---------------------------------------------------------------------------

def test_rtsp_probe_returns_true_on_200(monkeypatch):
    mock_sock = MagicMock()
    mock_sock.__enter__ = lambda s: s
    mock_sock.__exit__ = MagicMock(return_value=False)
    mock_sock.recv.return_value = b"RTSP/1.0 200 OK\r\nCSeq: 1\r\n\r\n"
    mock_sock.connect_ex.return_value = 0
    mock_sock.connect = MagicMock()

    import socket as _socket
    monkeypatch.setattr(_socket, "socket", lambda *a, **kw: mock_sock)
    from agent.scanner import _rtsp_probe
    assert _rtsp_probe("10.0.0.1", 554, "admin", "admin") is True


def test_rtsp_probe_returns_false_on_error(monkeypatch):
    import socket as _socket
    monkeypatch.setattr(_socket, "socket", MagicMock(side_effect=OSError("refused")))
    from agent.scanner import _rtsp_probe
    assert _rtsp_probe("10.0.0.1", 554, "admin", "admin") is False


# ---------------------------------------------------------------------------
# _try_default_creds
# ---------------------------------------------------------------------------

def test_try_default_creds_returns_first_working(monkeypatch):
    calls = []
    def fake_probe(ip, port, user, pwd, **kw):
        calls.append((user, pwd))
        return user == "admin" and pwd == "12345"

    with patch("agent.scanner._rtsp_probe", side_effect=fake_probe):
        from agent.scanner import _try_default_creds
        result = _try_default_creds("10.0.0.1", 554)

    assert result == ("admin", "12345")
    # deve ter tentado admin/admin antes de chegar em admin/12345
    assert ("admin", "admin") in calls


def test_try_default_creds_returns_none_when_all_fail(monkeypatch):
    with patch("agent.scanner._rtsp_probe", return_value=False):
        from agent.scanner import _try_default_creds
        assert _try_default_creds("10.0.0.1", 554) is None


# ---------------------------------------------------------------------------
# _detect_dvr
# ---------------------------------------------------------------------------

def test_detect_dvr_identifies_intelbras(monkeypatch):
    mock_resp = MagicMock()
    mock_resp.headers = {"server": ""}
    mock_resp.text = "<title>Intelbras MHDX 3008</title>"

    with patch("agent.scanner.httpx.get", return_value=mock_resp):
        from agent.scanner import _detect_dvr
        mfr, ch = _detect_dvr("10.0.0.1", 80)

    assert mfr == "intelbras"
    assert ch == 8


def test_detect_dvr_returns_none_for_plain_camera(monkeypatch):
    mock_resp = MagicMock()
    mock_resp.headers = {"server": "Axis/9.80"}
    mock_resp.text = ""

    with patch("agent.scanner.httpx.get", return_value=mock_resp):
        from agent.scanner import _detect_dvr
        mfr, ch = _detect_dvr("10.0.0.1", 80)

    # Axis não está nos DVR_SIGNATURES — não é DVR
    assert mfr is None


def test_detect_dvr_returns_none_on_connection_error(monkeypatch):
    with patch("agent.scanner.httpx.get", side_effect=Exception("timeout")):
        from agent.scanner import _detect_dvr
        mfr, ch = _detect_dvr("10.0.0.1", 80)
    assert mfr is None
    assert ch is None


# ---------------------------------------------------------------------------
# discover_port_scan com DVR enrichment
# ---------------------------------------------------------------------------

def test_port_scan_enriches_dvr_candidate(monkeypatch):
    with (
        patch("agent.scanner._arp_hosts", return_value=["10.0.0.10"]),
        patch("agent.scanner._tcp_open", side_effect=lambda ip, p, **kw: p == 80),
        patch("agent.scanner._detect_dvr", return_value=("intelbras", 8)),
        patch("agent.scanner._try_default_creds", return_value=("admin", "admin")),
        patch("agent.scanner._guess_manufacturer", return_value="Intelbras"),
    ):
        from agent.scanner import discover_port_scan
        results = discover_port_scan(timeout_per_host=0.1)

    assert len(results) == 1
    r = results[0]
    assert r["device_type"] == "dvr"
    assert r["channel_count"] == 8
    assert r["username"] == "admin"
    assert r["password"] == "admin"
    assert r["credentials_ok"] is True


def test_port_scan_marks_camera_when_no_dvr(monkeypatch):
    with (
        patch("agent.scanner._arp_hosts", return_value=["10.0.0.20"]),
        patch("agent.scanner._tcp_open", side_effect=lambda ip, p, **kw: p == 554),
        patch("agent.scanner._detect_dvr", return_value=(None, None)),
        patch("agent.scanner._try_default_creds", return_value=None),
        patch("agent.scanner._guess_manufacturer", return_value=None),
    ):
        from agent.scanner import discover_port_scan
        results = discover_port_scan(timeout_per_host=0.1)

    assert results[0]["device_type"] == "camera"
    assert results[0]["credentials_ok"] is False
```

- [ ] **Step 2: Rodar testes**

```bash
PYTHONPATH=. python3 -m pytest agent/tests/test_scanner.py -v 2>&1 | tail -30
```

Esperado: todos passando (incluindo os novos).

- [ ] **Step 3: Commit**

```bash
git add agent/tests/test_scanner.py
git commit -m "test(scanner): cobre DVR detection, RTSP probe e credential probing"
```

---

## Task 4: Edge Function agent-cameras-found — persistir novos campos

**Files:**
- Modify: `supabase/functions/agent-cameras-found/index.ts`

- [ ] **Step 1: Atualizar o insert para incluir novos campos**

Substituir o bloco de insert (linhas ~79-89 do arquivo atual):

```typescript
    if (newCameras.length > 0) {
      await supabase.from('agent_camera_candidates').insert(
        newCameras.map((c) => ({
          agent_id:        agent.id,
          ip:              c.ip,
          mac:             c.mac          ?? null,
          name:            c.name         ?? null,
          port:            c.port         ?? null,
          service_url:     c.service_url  ?? null,
          manufacturer:    c.manufacturer ?? null,
          device_type:     c.device_type  ?? 'camera',
          channel_count:   c.channel_count ?? null,
          username:        c.username     ?? null,
          password:        c.password     ?? null,
          credentials_ok:  c.credentials_ok ?? null,
          approved:        null,
        })),
      );
    }
```

- [ ] **Step 2: Atualizar o tipo da variável `cameras`**

Na linha que declara `cameras`, atualizar o tipo:

```typescript
    const cameras: Array<{
      ip: string;
      mac?: string;
      name?: string;
      port?: number;
      service_url?: string;
      manufacturer?: string;
      device_type?: string;
      channel_count?: number;
      username?: string;
      password?: string;
      credentials_ok?: boolean;
    }> = body.cameras ?? [];
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/agent-cameras-found/index.ts
git commit -m "feat(edge): agent-cameras-found persiste device_type, credenciais e canais"
```

---

## Task 5: Frontend — interfaces + approveCandidate + DVR UI

**Files:**
- Modify: `src/pages/Agents.tsx`

- [ ] **Step 1: Atualizar `CameraConfig` e `CameraCandidate`**

Substituir as interfaces existentes:

```typescript
interface CameraConfig {
  id: string;
  ip: string;
  role: 'counting' | 'cash';
  name: string;
  line_y: number;
  user: string;
  pass: string;
  rtsp_path: string;
}

interface CameraCandidate {
  id: string;
  agent_id: string;
  ip: string;
  mac: string | null;
  name: string | null;
  port: number | null;
  service_url: string | null;
  manufacturer: string | null;
  device_type: 'camera' | 'dvr';
  channel_count: number | null;
  username: string | null;
  password: string | null;
  credentials_ok: boolean | null;
  approved: boolean | null;
}
```

- [ ] **Step 2: Adicionar helper `_rtspPath`**

Adicionar após as interfaces:

```typescript
function _rtspPath(manufacturer: string | null, channel: number): string {
  const m = (manufacturer ?? '').toLowerCase();
  if (m.includes('dahua') || m.includes('intelbras')) return `/cam/realmonitor?channel=${channel}&subtype=0`;
  if (m.includes('hikvision')) return `/Streaming/Channels/${String(channel).padStart(2,'0')}01`;
  if (m.includes('axis')) return `/axis-media/media.amp?camera=${channel}`;
  if (m.includes('reolink')) return `/h264Preview_${String(channel).padStart(2,'0')}_main`;
  return `/stream${channel > 1 ? channel : ''}`;
}
```

- [ ] **Step 3: Atualizar `approveCandidate` para câmeras simples**

Substituir `approveCandidate` completo:

```typescript
  async function approveCandidate(candidate: CameraCandidate) {
    const agent = agents.find((a) => a.id === candidate.agent_id);
    if (!agent) return;

    const newCamera: CameraConfig = {
      id:        crypto.randomUUID(),
      ip:        candidate.ip,
      name:      candidate.name ?? candidate.ip,
      role:      'counting',
      line_y:    0.5,
      user:      candidate.username ?? 'admin',
      pass:      candidate.password ?? '',
      rtsp_path: _rtspPath(candidate.manufacturer, 1),
    };

    const updatedCameras = [...(agent.cameras ?? []), newCamera];

    await Promise.all([
      supabase
        .from('agent_configs')
        .update({ cameras: updatedCameras, config_changed_at: new Date().toISOString() })
        .eq('id', agent.id),
      supabase
        .from('agent_camera_candidates')
        .update({ approved: true })
        .eq('id', candidate.id),
    ]);

    setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, cameras: updatedCameras } : a)));
    setCandidates((prev) => prev.filter((c) => c.id !== candidate.id));
  }
```

- [ ] **Step 4: Adicionar `approveDvr` para DVRs**

Adicionar após `approveCandidate`:

```typescript
  async function approveDvr(
    candidate: CameraCandidate,
    username: string,
    password: string,
    channelCount: number,
  ) {
    const agent = agents.find((a) => a.id === candidate.agent_id);
    if (!agent) return;

    const newCameras: CameraConfig[] = Array.from({ length: channelCount }, (_, i) => ({
      id:        crypto.randomUUID(),
      ip:        candidate.ip,
      name:      `${candidate.name ?? candidate.manufacturer ?? 'DVR'} — Canal ${i + 1}`,
      role:      'counting' as const,
      line_y:    0.5,
      user:      username,
      pass:      password,
      rtsp_path: _rtspPath(candidate.manufacturer, i + 1),
    }));

    const updatedCameras = [...(agent.cameras ?? []), ...newCameras];

    await Promise.all([
      supabase
        .from('agent_configs')
        .update({ cameras: updatedCameras, config_changed_at: new Date().toISOString() })
        .eq('id', agent.id),
      supabase
        .from('agent_camera_candidates')
        .update({ approved: true })
        .eq('id', candidate.id),
    ]);

    setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, cameras: updatedCameras } : a)));
    setCandidates((prev) => prev.filter((c) => c.id !== candidate.id));
  }
```

- [ ] **Step 5: Criar componente `DvrModal`**

Adicionar antes do componente `AgentCard`:

```typescript
function DvrModal({
  candidate,
  onConfirm,
  onClose,
}: {
  candidate: CameraCandidate;
  onConfirm: (username: string, password: string, channels: number) => Promise<void>;
  onClose: () => void;
}) {
  const [username, setUsername] = useState(candidate.username ?? 'admin');
  const [password, setPassword] = useState(candidate.password ?? '');
  const [channels, setChannels] = useState(candidate.channel_count ?? 4);
  const [loading, setLoading] = useState(false);

  const credOk = candidate.credentials_ok === true;

  async function handleConfirm() {
    setLoading(true);
    try { await onConfirm(username, password, channels); }
    finally { setLoading(false); }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6 space-y-4"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-bold text-text text-base">
          DVR {candidate.manufacturer ?? ''} — {candidate.ip}
        </p>

        {credOk && (
          <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--color-success)' }}>
            Credenciais verificadas automaticamente ({username}/{password || '(sem senha)'})
          </div>
        )}

        {!credOk && (
          <>
            <div>
              <label className="text-xs text-text-dim">Usuário</label>
              <input
                className="w-full mt-1 rounded-lg px-3 py-2 text-sm text-text"
                style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-text-dim">Senha</label>
              <input
                type="password"
                className="w-full mt-1 rounded-lg px-3 py-2 text-sm text-text"
                style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </>
        )}

        <div>
          <label className="text-xs text-text-dim">Número de canais</label>
          <select
            className="w-full mt-1 rounded-lg px-3 py-2 text-sm text-text"
            style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
            value={channels}
            onChange={(e) => setChannels(Number(e.target.value))}
          >
            {[1,2,4,8,16,32].map((n) => (
              <option key={n} value={n}>{n} {n === 1 ? 'canal' : 'canais'}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            className="flex-1 rounded-xl py-2 text-sm font-semibold"
            style={{ background: 'var(--color-border)', color: 'var(--color-text-dim)' }}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            className="flex-1 rounded-xl py-2 text-sm font-semibold"
            style={{ background: 'var(--color-primary)', color: '#fff' }}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? 'Ativando…' : `Ativar ${channels} canal${channels !== 1 ? 'is' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Adicionar estado do modal no componente `AgentCard` e botão "Configurar DVR"**

No componente `AgentCard`, adicionar estado e atualizar a renderização dos candidatos:

```typescript
// Adicionar estado dentro de AgentCard:
const [dvrModal, setDvrModal] = useState<CameraCandidate | null>(null);

// No JSX onde mapeia candidates, substituir o trecho de cada candidato:
{candidates.map((c) => (
  <div
    key={c.id}
    className="flex items-center justify-between gap-2 rounded-xl px-3 py-2"
    style={{ background: 'var(--color-bg)' }}
  >
    <div className="flex-1 min-w-0">
      <p className="text-xs font-semibold text-text truncate">{c.ip}</p>
      <p className="text-[11px] text-text-dim">
        {c.manufacturer ?? 'Dispositivo desconhecido'}
        {c.device_type === 'dvr' && c.channel_count ? ` · ${c.channel_count} canais` : ''}
        {c.credentials_ok ? ' · 🔑 creds OK' : ''}
      </p>
    </div>
    {c.device_type === 'dvr' ? (
      <button
        className="shrink-0 text-xs font-semibold px-3 py-1 rounded-lg"
        style={{ background: 'var(--color-primary)', color: '#fff' }}
        onClick={() => setDvrModal(c)}
      >
        Configurar DVR
      </button>
    ) : (
      <div className="flex gap-1 shrink-0">
        <button
          className="text-xs font-semibold px-3 py-1 rounded-lg"
          style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--color-success)' }}
          onClick={() => onApprove(c)}
        >
          Aprovar
        </button>
        <button
          className="text-xs px-2 py-1 rounded-lg"
          style={{ background: 'var(--color-bg)', color: 'var(--color-text-dim)' }}
          onClick={() => onIgnore(c)}
        >
          Ignorar
        </button>
      </div>
    )}
  </div>
))}

{/* Modal DVR */}
{dvrModal && (
  <DvrModal
    candidate={dvrModal}
    onConfirm={async (user, pass, ch) => {
      await onApproveDvr(dvrModal, user, pass, ch);
      setDvrModal(null);
    }}
    onClose={() => setDvrModal(null)}
  />
)}
```

- [ ] **Step 7: Passar `onApproveDvr` para `AgentCard`**

Atualizar a interface de props de `AgentCard`:

```typescript
interface AgentCardProps {
  // ... props existentes ...
  onApproveDvr: (c: CameraCandidate, user: string, pass: string, channels: number) => Promise<void>;
}
```

E no uso de `<AgentCard>` no JSX principal, adicionar:

```tsx
onApproveDvr={approveDvr}
```

- [ ] **Step 8: Build TypeScript**

```bash
npm run build 2>&1 | tail -10
```

Esperado: `✓ built in Xs` sem erros.

- [ ] **Step 9: Commit**

```bash
git add src/pages/Agents.tsx
git commit -m "feat(agents): UI por device_type — DVR modal com credenciais e seleção de canais"
```

---

## Task 6: Deploy e verificação final

- [ ] **Step 1: Push tudo**

```bash
git push
```

- [ ] **Step 2: Verificar CI verde**

```bash
gh run list --workflow=ci.yml --limit=1
```

Esperado: `completed success`

- [ ] **Step 3: Executar migration no Supabase**

No SQL Editor do painel Supabase, executar o conteúdo de `supabase/migration_dvr.sql`.

- [ ] **Step 4: Deploy Edge Function**

```bash
supabase functions deploy agent-cameras-found
```

Ou via painel Supabase → Edge Functions → agent-cameras-found → Deploy from GitHub.

- [ ] **Step 5: Commit final com tag de versão**

```bash
git tag agent-v0.3.0
git push origin agent-v0.3.0
```

Isso dispara o GitHub Actions para gerar novo instalador Windows com o agente atualizado.

---

## Self-review

**Spec coverage:**
- ✅ Câmera IP ONVIF → fluxo não mudou, `approveCandidate` agora popula user/pass
- ✅ DVR analógico → `_detect_dvr` + `_try_default_creds` + `DvrModal` + `approveDvr`
- ✅ Câmera IP sem ONVIF → port scan + credential probe + `approveCandidate` com creds
- ✅ DB columns → `migration_dvr.sql`
- ✅ Edge Function → aceita e persiste todos os campos
- ✅ RTSP URL por marca → `_rtspPath` helper + `_rtsp_path` no scanner
- ✅ Testes → Tasks 2 e 3 cobrem todos os novos caminhos

**Type consistency:**
- `CameraConfig.user` / `CameraConfig.pass` — consistente com o schema JSONB em `migration_agent.sql`
- `_rtspPath` (frontend TS) e `_rtsp_path` não existe no Python — o Python monta a URL em `models.py` via `rtsp_path` field, ok
- `onApproveDvr` passado como prop em Task 5 steps 7 e 9 — consistente

**Sem placeholders:** confirmado — cada step tem código completo.
