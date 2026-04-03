"""
PyInstaller runtime hook for debugging server startup
"""

import sys
import os

# Print debug information
print(f"[DEBUG] Python executable: {sys.executable}")
print(f"[DEBUG] Current directory: {os.getcwd()}")
print(f"[DEBUG] sys.path: {sys.path}")
print(f"[DEBUG] __file__: {__file__}")
print(f"[DEBUG] sys.argv: {sys.argv}")

# Set up environment
if getattr(sys, "frozen", False):
    # Running in PyInstaller bundle
    bundle_dir = sys._MEIPASS
    print(f"[DEBUG] Bundle directory: {bundle_dir}")
else:
    print("[DEBUG] Not running in PyInstaller bundle")
