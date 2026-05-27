import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from backend import server


class FFmpegResolutionTests(unittest.TestCase):
    def test_setup_ffmpeg_finds_windows_pyinstaller_exe(self):
        with tempfile.TemporaryDirectory() as tmp:
            bundle_dir = Path(tmp) / "bundle"
            ffmpeg = bundle_dir / "_internal" / "node_modules" / "ffmpeg-static" / "ffmpeg.exe"
            ffmpeg.parent.mkdir(parents=True)
            ffmpeg.write_bytes(b"placeholder")

            old_cwd = os.getcwd()
            old_frozen = getattr(sys, "frozen", None)
            old_meipass = getattr(sys, "_MEIPASS", None)

            try:
                os.chdir(tmp)
                sys.frozen = True
                sys._MEIPASS = str(bundle_dir)

                with mock.patch("backend.server.subprocess.run") as run:
                    resolved = server.setup_ffmpeg()

                self.assertEqual(os.path.normcase(str(ffmpeg)), os.path.normcase(resolved))
                run.assert_called_once_with(
                    [str(ffmpeg), "-version"], capture_output=True, check=True
                )
            finally:
                os.chdir(old_cwd)
                if old_frozen is None:
                    delattr(sys, "frozen")
                else:
                    sys.frozen = old_frozen
                if old_meipass is None:
                    delattr(sys, "_MEIPASS")
                else:
                    sys._MEIPASS = old_meipass


if __name__ == "__main__":
    unittest.main()
