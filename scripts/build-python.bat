@echo off
REM Build script for UAudioLab Python backend
REM Supports: Windows
REM
REM Usage:
REM   scripts\build-python.bat
REM
REM Output:
REM   dist\server\ - Standalone Python backend executable

setlocal enabledelayedexpansion

echo ========================================
echo UAudioLab Python Backend Builder
echo Platform: Windows
echo ========================================
echo.

REM Get project root
set "PROJECT_ROOT=%~dp0.."
cd /d "%PROJECT_ROOT%"
for /f "delims=" %%i in ('cd') do set "PROJECT_ROOT=%%i"

set "BACKEND_DIR=%PROJECT_ROOT%\backend"
set "DIST_DIR=%PROJECT_ROOT%\dist"
set "BUILD_DIR=%PROJECT_ROOT%\build"
set "SPECFILE=%BACKEND_DIR%\server.spec"

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    python3 --version >nul 2>&1
    if errorlevel 1 (
        echo Error: Python not found. Please install Python 3.9+
        exit /b 1
    ) else (
        set PYTHON=python3
    )
) else (
    set PYTHON=python
)

for /f "tokens=*" %%a in ('%PYTHON% --version 2^>^&1') do set PYTHON_VERSION=%%a
echo [OK] Python found: %PYTHON_VERSION%

REM Check pip
%PYTHON% -m pip --version >nul 2>&1
if errorlevel 1 (
    echo Error: pip not found. Please install pip.
    exit /b 1
)
echo [OK] pip found

REM Check if running in virtual environment
if "%VIRTUAL_ENV%"=="" (
    echo Warning: Not running in virtual environment. It's recommended to use venv.
    set /p CONTINUE="Continue anyway? (y/N) "
    if /i not "!CONTINUE!"=="y" (
        echo Create a virtual environment first:
        echo   python -m venv venv
        echo   venv\Scripts\activate
        exit /b 1
    )
)

echo.
echo Step 1: Installing/Upgrading PyInstaller...
%PYTHON% -m pip install --upgrade pyinstaller
if errorlevel 1 (
    echo Error: Failed to install PyInstaller
    exit /b 1
)

echo.
echo Step 2: Verifying Python dependencies...
set REQUIRED_PACKAGES=flask librosa numpy scikit-learn soundfile scipy audioread

for %%p in (%REQUIRED_PACKAGES%) do (
    %PYTHON% -c "import %%p" 2>nul
    if errorlevel 1 (
        echo   Installing %%p...
        %PYTHON% -m pip install %%p
    ) else (
        echo   [OK] %%p
    )
)

echo.
echo Step 3: Checking FFmpeg binary...
set "FFMPEG_PATH=%PROJECT_ROOT%\node_modules\ffmpeg-static\ffmpeg.exe"

if exist "%FFMPEG_PATH%" (
    echo [OK] FFmpeg binary found at node_modules\ffmpeg-static\ffmpeg.exe
) else (
    echo Warning: FFmpeg binary not found at %FFMPEG_PATH%
    echo   Make sure to run 'npm install' first to install ffmpeg-static
    echo   The build will continue, but the app may fail at runtime if FFmpeg is not available
)

echo.
echo Step 4: Cleaning previous builds...
if exist "%BUILD_DIR%" rmdir /s /q "%BUILD_DIR%"
if exist "%DIST_DIR%\server" rmdir /s /q "%DIST_DIR%\server"
if exist "%DIST_DIR%\server.exe" del /f /q "%DIST_DIR%\server.exe"
echo [OK] Cleaned

echo.
echo Step 5: Building with PyInstaller...
echo This may take several minutes...
echo.

cd /d "%BACKEND_DIR%"
%PYTHON% -m PyInstaller "%SPECFILE%" --clean --noconfirm
if errorlevel 1 (
    echo Error: PyInstaller build failed
    exit /b 1
)

echo.
echo [OK] Build completed successfully!

REM Find output
if exist "%DIST_DIR%\server\server.exe" (
    set "OUTPUT_DIR=%DIST_DIR%\server"
    set "EXECUTABLE=%DIST_DIR%\server\server.exe"
) else if exist "%BACKEND_DIR%\dist\server\server.exe" (
    set "OUTPUT_DIR=%BACKEND_DIR%\dist\server"
    set "EXECUTABLE=%BACKEND_DIR%\dist\server\server.exe"
    move "%BACKEND_DIR%\dist" "%PROJECT_ROOT%\"
) else (
    echo Warning: Could not find output directory
    dir /s /b "%PROJECT_ROOT%\server.exe" 2>nul | findstr /i "server.exe"
)

if exist "%OUTPUT_DIR%" (
    echo.
    echo ========================================
    echo Build Output:
    echo   Directory: %OUTPUT_DIR%
    
    if exist "%EXECUTABLE%" (
        echo   Executable: %EXECUTABLE%
        
        REM Get size
        for %%F in ("%OUTPUT_DIR%") do (
            echo   Size: %%~zF bytes
        )
    )
    
    REM Check for FFmpeg
    if exist "%OUTPUT_DIR%\_internal\node_modules\ffmpeg-static\ffmpeg.exe" (
        echo   FFmpeg: Included
    ) else (
        echo   FFmpeg: Not included
    )
    
    echo ========================================
    echo.
    echo To test the executable:
    echo   %EXECUTABLE%
    echo.
    echo Or copy to Electron resources:
    echo   mkdir electron\resources
    echo   xcopy /E /I %OUTPUT_DIR% electron\resources\
)

echo.
echo Done!

endlocal
