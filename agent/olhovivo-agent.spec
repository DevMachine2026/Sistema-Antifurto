# agent/olhovivo-agent.spec
# PyInstaller spec para gerar o executável distribuível do Olho Vivo Agent.
# Executar a partir da raiz do repositório:
#   pyinstaller agent/olhovivo-agent.spec

from PyInstaller.utils.hooks import collect_all, collect_submodules

block_cipher = None

all_datas, all_binaries, all_hiddenimports = [], [], []

for pkg in ("ultralytics", "cv2"):
    d, b, h = collect_all(pkg)
    all_datas += d
    all_binaries += b
    all_hiddenimports += h

all_hiddenimports += collect_submodules("torch")
all_hiddenimports += [
    "PIL",
    "PIL.Image",
    "yaml",
    "scipy",
    "lapx",
    "wsdiscovery",
    "wsdiscovery.discovery",
    "httpx",
    "sqlite3",
    "agent.config_sync",
    "agent.camera_discovery",
    "agent.event_publisher",
    "agent.heartbeat",
    "agent.people_counter",
    "agent.models",
]

a = Analysis(
    ["main.py"],
    pathex=[".."],
    binaries=all_binaries,
    datas=all_datas,
    hiddenimports=all_hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "notebook", "IPython", "jupyter"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="olhovivo-agent",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="olhovivo-agent",
)
