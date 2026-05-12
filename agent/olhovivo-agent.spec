import os

from PyInstaller.utils.hooks import collect_all

# SPECPATH = pasta onde está o .spec (agent/), não o caminho do arquivo .spec
_spec_dir = os.path.abspath(SPECPATH)
_repo_root = os.path.abspath(os.path.join(_spec_dir, ".."))

block_cipher = None

all_datas, all_binaries, all_hiddenimports = [], [], []

for pkg in ("onnxruntime", "cv2"):
    d, b, h = collect_all(pkg)
    all_datas += d
    all_binaries += b
    all_hiddenimports += h

all_hiddenimports += [
    "numpy",
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
    "agent.token_from_name",
]

_onnx = os.path.join(_spec_dir, "yolov8n.onnx")
all_datas += [(_onnx, ".")]

a = Analysis(
    [os.path.join(_spec_dir, "main.py")],
    pathex=[_repo_root],
    binaries=all_binaries,
    datas=all_datas,
    hiddenimports=all_hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "torch", "ultralytics", "PIL", "scipy"],
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
    console=False,
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
