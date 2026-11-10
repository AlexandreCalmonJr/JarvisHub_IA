# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path

block_cipher = None
PROJECT_ROOT = Path('.').resolve()

added_files = [
    (str(PROJECT_ROOT / 'apps' / 'dashboard' / 'dist'), 'apps/dashboard/dist'),
    (str(PROJECT_ROOT / 'apps' / 'dashboard' / 'dist'), 'dist'),
    (str(PROJECT_ROOT / 'skills'), 'skills'),
    (str(PROJECT_ROOT / 'data'), 'data'),
    (str(PROJECT_ROOT / 'workspace'), 'workspace'),
    (str(PROJECT_ROOT / 'packaging' / 'jarvis.ico'), 'packaging'),
]

hidden_imports = [
    'uvicorn',
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'fastapi',
    'fastapi.staticfiles',
    'fastapi.middleware.cors',
    'starlette',
    'starlette.staticfiles',
    'starlette.routing',
    'starlette.responses',
    'webview',
    'webview.platforms.winforms',
    'clr',
    'pythonnet',
    'aiosqlite',
    'sqlite3',
    'pydantic',
    'pydantic_settings',
    'langgraph',
    'langchain_core',
    'ollama',
    'httpx',
    'psutil',
    'yaml',
    'services',
    'packages',
    'agents',
    'duckdb',
    'lancedb',
    'pyarrow',
    'services.autonomous_agent',
    'packages.agent_sdk',
]

a = Analysis(
    [str(PROJECT_ROOT / 'apps' / 'desktop' / 'main_window.py')],
    pathex=[str(PROJECT_ROOT)],
    binaries=[],
    datas=added_files,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'scipy', 'torch'],
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
    name='JarvisHub',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    icon=str(PROJECT_ROOT / 'packaging' / 'jarvis.ico'),
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='JarvisHub',
)
