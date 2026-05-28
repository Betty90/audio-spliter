from pathlib import Path
import json
import unittest


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


class ElectronMigrationCleanupTest(unittest.TestCase):
    def test_electron_dev_loads_configured_vite_port(self):
        main = read("electron/main.ts")
        vite = read("vite.config.ts")

        self.assertIn("port: 3000", vite)
        self.assertIn("mainWindow.loadURL('http://localhost:3000')", main)
        self.assertNotIn("localhost:3001", main)

    def test_electron_dev_preload_uses_project_root(self):
        main = read("electron/main.ts")

        self.assertIn("const appRoot = isDev ? process.cwd() : app.getAppPath()", main)
        self.assertIn("preload: path.join(appRoot, 'electron/preload.js')", main)
        self.assertNotIn("preload: path.join(app.getAppPath(), 'electron/preload.js')", main)

    def test_settings_default_uses_electron_managed_backend(self):
        settings_modal = read("components/SettingsModal.tsx")
        api_service = read("services/apiService.ts")
        app = read("App.tsx")

        self.assertNotIn("backendUrl: '/api'", settings_modal)
        self.assertNotIn("python backend/server.py", settings_modal)
        self.assertNotIn("请确保 Python 服务正在运行", app)
        self.assertNotIn("{settings.backendUrl", app)
        self.assertIn("settings.backendUrl !== '/api'", api_service)
        self.assertIn("return `http://127.0.0.1:${port}`", api_service)
        self.assertNotIn("return `http://localhost:${port}`", api_service)
        self.assertIn("window.electron?.getPythonPort", api_service)

    def test_convert_audio_uses_backend_format_field(self):
        api_service = read("services/apiService.ts")
        backend = read("backend/server.py")

        self.assertIn("formData.append('target_format', outputFormat)", api_service)
        self.assertIn('request.form.get("target_format")', backend)
        self.assertNotIn("formData.append('output_format'", api_service)

    def test_python_build_artifacts_use_py_dist_name(self):
        build_js = read("scripts/build.js")
        builder = read("electron-builder.yml")

        self.assertIn("'py-dist'", build_js)
        self.assertNotIn("'python-dist'", build_js)
        self.assertNotIn('"python-dist"', build_js)
        self.assertNotIn("python-dist", builder)

    def test_removed_unused_web_backend_cors_dependency(self):
        requirements = read("backend/requirements.txt")
        backend = read("backend/server.py")

        self.assertNotIn("flask-cors", requirements)
        self.assertNotIn("make_response", backend)
        self.assertIn("@app.after_request", backend)
        self.assertIn("Access-Control-Allow-Origin", backend)
        self.assertIn("Access-Control-Allow-Headers", backend)

    def test_linux_package_does_not_require_system_backend_runtime(self):
        builder = read("electron-builder.yml")

        self.assertNotIn("python3", builder)
        self.assertNotIn("python3-pip", builder)
        self.assertNotIn("- ffmpeg", builder)

    def test_default_dev_script_targets_electron(self):
        package_json = json.loads(read("package.json"))
        scripts = package_json["scripts"]

        self.assertEqual("npm run electron:dev", scripts["dev"])
        self.assertIn("web:dev", scripts)
        self.assertIn("vite", scripts["web:dev"])
        self.assertIn("backend/server.py", scripts["web:dev"])


if __name__ == "__main__":
    unittest.main()
