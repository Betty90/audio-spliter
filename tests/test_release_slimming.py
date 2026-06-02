import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


class ReleaseSlimmingTests(unittest.TestCase):
    def test_macos_release_only_builds_dmg(self):
        builder = read("electron-builder.yml")

        self.assertIn("target: dmg", builder)
        self.assertNotIn("target: zip", builder)

    def test_packaging_does_not_publish_unless_requested(self):
        build_js = read("scripts/build.js")

        self.assertIn("args.push('--publish', 'never')", build_js)
        self.assertIn("args.push('--publish', 'always')", build_js)

    def test_pyinstaller_excludes_unused_training_and_ml_frameworks(self):
        spec = read("backend/server.spec")

        for package in [
            "'torch'",
            "'tensorflow'",
            "'onnx'",
            "'cupy'",
            "'dask'",
        ]:
            self.assertIn(package, spec)

    def test_neural_backend_does_not_import_legacy_audio_stack(self):
        backend = read("backend/server.py")
        neural = read("backend/neural_diarization.py")

        self.assertNotIn("import librosa", backend)
        self.assertNotIn("from sklearn", backend)
        self.assertNotIn("from scipy", backend)
        self.assertNotIn("GaussianMixture", backend)
        self.assertNotIn("def process_audio(", backend)
        self.assertNotIn("import librosa", neural)
        self.assertNotIn("from sklearn", neural)


if __name__ == "__main__":
    unittest.main()
