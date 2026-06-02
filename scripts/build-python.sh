#!/bin/bash
#
# Build script for AudioSlicer AI Python backend
# Supports: macOS, Linux
#
# Usage:
#   ./scripts/build-python.sh
#
# Output:
#   dist/server/ - Standalone Python backend executable
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
DIST_DIR="$PROJECT_ROOT/py-dist"
BUILD_DIR="$PROJECT_ROOT/py-build"
SPECFILE="$BACKEND_DIR/server.spec"

# Detect platform
PLATFORM=$(uname -s)
ARCH=$(uname -m)

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}AudioSlicer AI Python Backend Builder${NC}"
echo -e "${GREEN}Platform: $PLATFORM ($ARCH)${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check Python
if command -v python3 &> /dev/null; then
    PYTHON=python3
elif command -v python &> /dev/null; then
    PYTHON=python
else
    echo -e "${RED}Error: Python not found. Please install Python 3.9+${NC}"
    exit 1
fi

PYTHON_VERSION=$($PYTHON --version 2>&1 | cut -d' ' -f2)
echo -e "${GREEN}✓ Python found: $PYTHON ($PYTHON_VERSION)${NC}"

# Check Python version is 3.9+
PYTHON_MAJOR=$($PYTHON -c 'import sys; print(sys.version_info.major)')
PYTHON_MINOR=$($PYTHON -c 'import sys; print(sys.version_info.minor)')

if [ "$PYTHON_MAJOR" -lt 3 ] || ([ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 9 ]); then
    echo -e "${RED}Error: Python 3.9+ required, found $PYTHON_MAJOR.$PYTHON_MINOR${NC}"
    exit 1
fi

# Check pip
if ! $PYTHON -m pip --version &> /dev/null; then
    echo -e "${RED}Error: pip not found. Please install pip.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ pip found${NC}"

# Check if running in virtual environment
if [ -z "${VIRTUAL_ENV}" ] && [ -z "${CI}" ]; then
    echo -e "${YELLOW}⚠ Not running in virtual environment. It's recommended to use venv.${NC}"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Create a virtual environment first:"
        echo "  python3 -m venv venv"
        echo "  source venv/bin/activate"
        exit 1
    fi
elif [ -n "${CI}" ]; then
    echo -e "${YELLOW}⚠ Not running in virtual environment, but CI detected. Continuing...${NC}"
fi

echo ""
echo -e "${YELLOW}Step 1: Installing/Upgrading PyInstaller...${NC}"
$PYTHON -m pip install --upgrade pyinstaller

echo ""
echo -e "${YELLOW}Step 2: Verifying Python dependencies...${NC}"
REQUIRED_PACKAGES="flask numpy soundfile onnxruntime kaldi-native-fbank"

for package in $REQUIRED_PACKAGES; do
    if $PYTHON -c "import ${package//-/_}" 2>/dev/null; then
        echo -e "${GREEN}  ✓ $package${NC}"
    else
        echo -e "${YELLOW}  ⚠ $package not found, installing...${NC}"
        $PYTHON -m pip install "$package"
    fi
done

echo ""
echo -e "${YELLOW}Step 3: Checking FFmpeg binary...${NC}"
FFMPEG_PATH="$PROJECT_ROOT/node_modules/ffmpeg-static/ffmpeg"

if [ -f "$FFMPEG_PATH" ]; then
    echo -e "${GREEN}✓ FFmpeg binary found at node_modules/ffmpeg-static/ffmpeg${NC}"
    # Make sure it's executable
    chmod +x "$FFMPEG_PATH"
else
    echo -e "${YELLOW}⚠ FFmpeg binary not found at $FFMPEG_PATH${NC}"
    echo "  Make sure to run 'npm install' first to install ffmpeg-static"
    echo "  The build will continue, but the app may fail at runtime if FFmpeg is not available"
fi

echo ""
echo -e "${YELLOW}Step 4: Cleaning previous builds...${NC}"
rm -rf "$BUILD_DIR"
rm -rf "$DIST_DIR/server"
rm -f "$DIST_DIR/server"
echo -e "${GREEN}✓ Cleaned${NC}"

echo ""
echo -e "${YELLOW}Step 5: Building with PyInstaller...${NC}"
echo "This may take several minutes..."
echo ""

cd "$BACKEND_DIR"
$PYTHON -m PyInstaller "$SPECFILE" --clean --noconfirm

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: PyInstaller build failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✓ Build completed successfully!${NC}"

# Find the output directory
if [ -d "$DIST_DIR/server" ]; then
    OUTPUT_DIR="$DIST_DIR/server"
else
    echo -e "${YELLOW}⚠ Could not find output directory, checking alternatives...${NC}"
    find "$PROJECT_ROOT" -name "server" -type f -executable 2>/dev/null | head -5
fi

if [ -d "$OUTPUT_DIR" ]; then
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}Build Output:${NC}"
    echo -e "${GREEN}  Directory: $OUTPUT_DIR${NC}"
    
    # Show executable location
    if [ -f "$OUTPUT_DIR/server" ]; then
        echo -e "${GREEN}  Executable: $OUTPUT_DIR/server${NC}"
        
        # Make executable
        chmod +x "$OUTPUT_DIR/server"
        
        # Show size
        SIZE=$(du -sh "$OUTPUT_DIR" | cut -f1)
        echo -e "${GREEN}  Size: $SIZE${NC}"
    fi
    
    # Check for FFmpeg
    if [ -f "$OUTPUT_DIR/_internal/node_modules/ffmpeg-static/ffmpeg" ]; then
        echo -e "${GREEN}  FFmpeg: Included${NC}"
    else
        echo -e "${YELLOW}  FFmpeg: Not included${NC}"
    fi
    
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "To test the executable:"
    echo "  $OUTPUT_DIR/server"
    echo ""
    echo "Or copy to Electron resources:"
    echo "  mkdir -p electron/resources"
    echo "  cp -r $OUTPUT_DIR electron/resources/"
fi

echo ""
echo -e "${GREEN}Done!${NC}"
