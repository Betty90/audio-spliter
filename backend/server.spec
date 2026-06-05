# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for UAudioLab Flask backend
Generated: 2026-03-23

This spec packages the Python Flask backend into a standalone executable
with the ONNX audio analysis runtime, bundled models, and FFmpeg binary.

Usage:
    pyinstaller backend/server.spec

Output:
    dist/server/ - Standalone application directory
    dist/server/server - Executable (macOS/Linux)
    dist/server/server.exe - Executable (Windows)
"""

import os
import sys
from PyInstaller.building.build_main import Analysis, PYZ, EXE, COLLECT, BUNDLE
from PyInstaller.building.datastruct import Tree
from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs

# Determine platform
IS_WINDOWS = sys.platform.startswith('win')
IS_MACOS = sys.platform == 'darwin'
IS_LINUX = sys.platform.startswith('linux')
STRIP_BINARIES = not IS_WINDOWS
USE_UPX = not IS_WINDOWS

# Project root directory
# PyInstaller passes the spec file path in a global variable
# Use it if available, otherwise fallback to current directory
if 'SPECFILE' in globals():
    SPEC_DIR = os.path.dirname(os.path.abspath(SPECFILE))
elif '__file__' in globals():
    SPEC_DIR = os.path.dirname(os.path.abspath(__file__))
else:
    # Fallback: assume spec is in backend/ subdirectory
    SPEC_DIR = os.path.abspath(os.path.dirname(sys.argv[0])) if len(sys.argv) > 0 else os.getcwd()

PROJECT_ROOT = os.path.abspath(os.path.join(SPEC_DIR, '..'))

# Set PyInstaller output directories to avoid conflicts with frontend dist/
build_dir = os.path.join(PROJECT_ROOT, 'py-build')
dist_dir = os.path.join(PROJECT_ROOT, 'py-dist')

# FFmpeg binary path
if IS_WINDOWS:
    FFMPEG_BINARY = os.path.join(PROJECT_ROOT, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')
else:
    FFMPEG_BINARY = os.path.join(PROJECT_ROOT, 'node_modules', 'ffmpeg-static', 'ffmpeg')

# Alternative ffmpeg paths for bundled app
FFMPEG_ALTERNATIVE_PATHS = [
    os.path.join('node_modules', 'ffmpeg-static', 'ffmpeg'),
    os.path.join('..', 'node_modules', 'ffmpeg-static', 'ffmpeg'),
]

if IS_WINDOWS:
    FFMPEG_ALTERNATIVE_PATHS = [p.replace('/', os.sep).replace('ffmpeg', 'ffmpeg.exe') for p in FFMPEG_ALTERNATIVE_PATHS]

# Hidden imports - keep this list narrow so PyInstaller does not pull optional ML frameworks.
hiddenimports = [
    "flask",
    "flask.cli",
    "werkzeug",
    "jinja2",
    "markupsafe",
    "itsdangerous",
    "click",
    "numpy",
    "soundfile",
    "_soundfile_data",
    "onnxruntime",
    "onnxruntime.capi",
    "onnxruntime.capi.onnxruntime_pybind11_state",
    "kaldi_native_fbank",
    "neural_diarization",
    "uuid",
    "tempfile",
    "mimetypes",
    "logging.handlers",
    "multiprocessing",
    "multiprocessing.resource_tracker",
]

# Binary files to include
binaries = []
binaries += collect_dynamic_libs('onnxruntime')
binaries += collect_dynamic_libs('kaldi_native_fbank')

# Data files to include
datas = []
datas += collect_data_files('onnxruntime')
datas += collect_data_files('kaldi_native_fbank')

# Include FFmpeg binary if it exists
if os.path.exists(FFMPEG_BINARY):
    print(f"Including FFmpeg binary: {FFMPEG_BINARY}")
    # Include in _internal directory, will be found by setup_ffmpeg()
    datas.append((FFMPEG_BINARY, 'node_modules/ffmpeg-static'))
else:
    print(f"WARNING: FFmpeg binary not found at {FFMPEG_BINARY}")
    print("The bundled app may fail if FFmpeg is not in system PATH")

# Include soundfile data files
import soundfile
soundfile_path = os.path.dirname(soundfile.__file__)
if os.path.exists(os.path.join(soundfile_path, '_soundfile_data')):
    datas.append((os.path.join(soundfile_path, '_soundfile_data'), '_soundfile_data'))

# Include bundled neural analysis models
models_dir = os.path.join(PROJECT_ROOT, 'backend', 'models')
if os.path.exists(models_dir):
    datas.append((models_dir, 'models'))
else:
    print(f"WARNING: Neural model directory not found at {models_dir}")

# Analysis configuration
a = Analysis(
    ['server.py'],
    pathex=[SPEC_DIR],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=['runtime_hook.py'],
    excludes=[
        # Exclude unnecessary packages to reduce size
        'matplotlib',
        'matplotlib.backends',
        'matplotlib.pyplot',
        'PIL',
        'PIL.Image',
        'tkinter',
        'Tkinter',
        '_tkinter',
        'PyQt5',
        'PyQt6',
        'PySide2',
        'PySide6',
        'wx',
        'wxPython',
        'IPython',
        'ipykernel',
        'jupyter',
        'notebook',
        'sphinx',
        'pytest',
        'torch',
        'tensorflow',
        'onnx',
        'cupy',
        'dask',
        'librosa',
        'sklearn',
        'scipy',
        'numba',
        'llvmlite',
        'resampy',
        'audioread',
        'pandas',
        'sympy',
        'pydantic',
        # Note: unittest is needed by numpy.testing, do not exclude
        # 'unittest',
        'test',
        '_testcapi',
        # pydoc is needed by scipy._lib._docscrape
        # 'pydoc',
        'doctest',
        'curses',
        'curses.ascii',
        'curses.has_key',
        'curses.panel',
        'curses.textpad',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=None,
    noarchive=False,
)

# Remove duplicate entries
pyz = PYZ(a.pure, a.zipped_data, cipher=None)

# Executable configuration
# Using onedir mode for faster startup (vs onefile)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=STRIP_BINARIES,  # Stripping Windows binaries can corrupt bundled DLL loading
    upx=USE_UPX,    # UPX can break python311.dll loading on Windows runners
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # Keep console for logging/debugging
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    build_dir=build_dir,
)

# Collect everything into a directory (onedir mode)
coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=STRIP_BINARIES,
    upx=USE_UPX,
    name='server',
    dist_dir=dist_dir
)

# macOS app bundle configuration (optional)
# Disabled for now - using plain executable instead
# if IS_MACOS:
#     app = BUNDLE(
#         exe,
#         name='UAudioLab Server.app',
#         icon=None,
#         bundle_identifier='com.uaudiolab.server',
#         info_plist={
#             'CFBundleShortVersionString': '1.0.0',
#             'CFBundleVersion': '1.0.0',
#             'NSHighResolutionCapable': 'True',
#         },
#     )
