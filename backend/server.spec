# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for AudioSlicer AI Flask backend
Generated: 2026-03-23

This spec packages the Python Flask backend into a standalone executable
with all dependencies (librosa, sklearn, scipy, etc.) and FFmpeg binary.

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

# Hidden imports - these are dynamically imported and need explicit inclusion
hiddenimports = [
    # Flask and Werkzeug
    'flask',
    'flask.cli',
    'werkzeug',
    'jinja2',
    'markupsafe',
    'itsdangerous',
    'click',
    
    # NumPy - critical for scientific computing
    'numpy',
    'numpy.core._dtype_ctypes',
    'numpy.core._multiarray_tests',
    'numpy.core._multiarray_umath',
    'numpy.linalg.lapack_lite',
    'numpy.random.common',
    'numpy.random.bounded_integers',
    'numpy.random.entropy',
    
    # SciPy - signal processing
    'scipy',
    'scipy.signal',
    'scipy.ndimage',
    'scipy.ndimage._nd_image',
    'scipy.ndimage._ni_label',
    'scipy.ndimage._ni_support',
    'scipy.special',
    'scipy.special._ufuncs',
    'scipy.special._ufuncs_cxx',
    'scipy.special.specfun',
    
    # Scikit-learn - machine learning
    'sklearn',
    'sklearn.cluster',
    'sklearn.cluster._kmeans',
    'sklearn.mixture',
    'sklearn.mixture._gaussian_mixture',
    'sklearn.preprocessing',
    'sklearn.preprocessing._data',
    'sklearn.utils',
    'sklearn.utils._cython_blas',
    'sklearn.utils._heap',
    'sklearn.utils._logistic_sigmoid',
    'sklearn.utils._random',
    'sklearn.utils._sorting',
    'sklearn.utils._weight_vector',
    'sklearn.utils.extmath',
    'sklearn.utils.fixes',
    'sklearn.utils.sparsefuncs',
    'sklearn.utils.validation',
    'sklearn.neighbors',
    'sklearn.neighbors._quad_tree',
    'sklearn.tree',
    'sklearn.tree._utils',
    
    # Librosa - audio processing
    'librosa',
    'librosa.core',
    'librosa.core.audio',
    'librosa.core.spectrum',
    'librosa.core.constantq',
    'librosa.core.pitch',
    'librosa.feature',
    'librosa.feature.spectral',
    'librosa.feature.rhythm',
    'librosa.feature.utils',
    'librosa.filters',
    'librosa.util',
    'librosa.util.decorators',
    'librosa.util.exceptions',
    'librosa.util.files',
    'librosa.util.matching',
    'librosa.util.utils',
    'librosa.effects',
    'librosa.beat',
    'librosa.decompose',
    'librosa.display',
    'librosa.onset',
    'librosa.segment',
    'librosa.sequence',
    
    # SoundFile - audio I/O
    'soundfile',
    '_soundfile_data',
    
    # Audioread - audio decoding
    'audioread',
    'audioread.rawread',
    'audioread.ffdec',
    'audioread.maddec',
    'audioread.gstdec',
    'audioread.macca',
    
    # Resampy (used by librosa for resampling)
    'resampy',
    'resampy.core',
    'resampy.filters',
    'resampy.interpn',
    
    # Numba (used by librosa for JIT compilation)
    'numba',
    'numba.core',
    'numba.core.codegen',
    'numba.core.compiler',
    'numba.core.registry',
    'numba.core.typing',
    'numba.np',
    'numba.np.arraymath',
    'numba.np.linalg',
    'numba.np.random',
    
    # Joblib (used by sklearn)
    'joblib',
    'joblib.externals',
    'joblib.externals.cloudpickle',
    'joblib.externals.loky',
    
    # Threading and multiprocessing
    'threading',
    'multiprocessing',
    'multiprocessing.pool',
    'multiprocessing.process',
    'multiprocessing.queues',
    'multiprocessing.reduction',
    'multiprocessing.resource_tracker',
    'multiprocessing.sharedctypes',
    'multiprocessing.spawn',
    'multiprocessing.synchronize',
    'multiprocessing.util',
    
    # Platform-specific
    'uuid',
    'tempfile',
    'mimetypes',
    'logging.handlers',
]

# Binary files to include
binaries = []

# Data files to include
datas = []

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

# Add sklearn datasets if needed (for any data files)
import sklearn
sklearn_path = os.path.dirname(sklearn.__file__)
if os.path.exists(os.path.join(sklearn_path, 'datasets')):
    datas.append((os.path.join(sklearn_path, 'datasets'), 'sklearn/datasets'))

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
#         name='AudioSlicer AI Server.app',
#         icon=None,
#         bundle_identifier='com.audioslicer.server',
#         info_plist={
#             'CFBundleShortVersionString': '1.0.0',
#             'CFBundleVersion': '1.0.0',
#             'NSHighResolutionCapable': 'True',
#         },
#     )
