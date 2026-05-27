from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


class AutoUpdateWiringTest(unittest.TestCase):
    def test_startup_update_check_is_silent_and_enabled(self):
        updater = read("electron/updater.ts")

        self.assertNotIn("Auto-updater is disabled", updater)
        self.assertIn("checkForUpdates(true)", updater)

    def test_manual_update_check_is_available_from_native_menu(self):
        main = read("electron/main.ts")

        self.assertIn("Menu", main)
        self.assertIn("检查更新...", main)
        self.assertIn("checkForUpdates(false)", main)
        self.assertIn("Menu.setApplicationMenu", main)

    def test_macos_update_check_prompts_for_manual_release_download(self):
        updater = read("electron/updater.ts")

        self.assertIn("process.platform !== 'darwin'", updater)
        self.assertIn("GITHUB_RELEASES_URL", updater)
        self.assertIn("shell.openExternal(GITHUB_RELEASES_URL)", updater)
        self.assertIn("Download Manually", updater)


if __name__ == "__main__":
    unittest.main()
