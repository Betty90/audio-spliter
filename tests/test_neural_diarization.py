import unittest
import io
from unittest import mock

import numpy as np

from backend import neural_diarization
from backend import server


class NeuralDiarizationTests(unittest.TestCase):
    def test_resolve_model_path_prefers_bundled_pyinstaller_models(self):
        with mock.patch.object(neural_diarization.sys, "frozen", True, create=True), mock.patch.object(
            neural_diarization.sys, "_MEIPASS", "/bundle", create=True
        ), mock.patch("backend.neural_diarization.os.path.exists") as exists:
            exists.side_effect = lambda path: path == "/bundle/models/silero_vad.onnx"

            path = neural_diarization.resolve_model_path("silero_vad.onnx")

        self.assertEqual("/bundle/models/silero_vad.onnx", path)

    def test_analyze_with_embeddings_assigns_stable_speaker_labels(self):
        audio = np.zeros(16000 * 6, dtype=np.float32)
        speech_regions = [
            neural_diarization.SpeechRegion(start=0.0, end=1.4),
            neural_diarization.SpeechRegion(start=2.0, end=3.4),
            neural_diarization.SpeechRegion(start=4.0, end=5.4),
        ]
        embeddings = [
            np.array([1.0, 0.0], dtype=np.float32),
            np.array([0.0, 1.0], dtype=np.float32),
            np.array([0.9, 0.1], dtype=np.float32),
        ]

        with mock.patch("backend.neural_diarization.load_audio_16k", return_value=(audio, 16000)), mock.patch.object(
            neural_diarization.NeuralDiarizer, "_speech_regions", return_value=speech_regions
        ), mock.patch.object(
            neural_diarization.NeuralDiarizer, "_embedding", side_effect=embeddings
        ):
            diarizer = neural_diarization.NeuralDiarizer(
                vad_model_path="/models/silero_vad.onnx",
                embedding_model_path="/models/campplus_cn_en_common_200k.onnx",
            )
            segments = diarizer.analyze("/tmp/input.wav", num_speakers=2, min_duration=0.5)

        self.assertEqual(
            [
                {"speaker": "音色 1", "start": 0.0, "end": 1.4},
                {"speaker": "音色 2", "start": 2.0, "end": 3.4},
                {"speaker": "音色 1", "start": 4.0, "end": 5.4},
            ],
            segments,
        )

    def test_required_neural_processor_raises_when_models_are_missing(self):
        with mock.patch(
            "backend.neural_diarization.create_default_diarizer",
            side_effect=neural_diarization.ModelUnavailable("missing"),
        ):
            with self.assertRaises(neural_diarization.ModelUnavailable):
                neural_diarization.process_audio_neural(
                    "/tmp/input.wav",
                    n_clusters=2,
                    min_duration=0.5,
                    min_silence_duration=0.5,
                )

    def test_upload_route_uses_required_neural_processor(self):
        with mock.patch.object(server, "process_audio_neural", return_value=[{"speaker": "音色 1", "start": 0.0, "end": 1.0}]) as neural:
            response = server.app.test_client().post(
                "/upload",
                data={
                    "file": (io.BytesIO(b"fake audio"), "input.wav"),
                    "numSpeakers": "2",
                    "minDuration": "0.5",
                    "minSilenceDuration": "0.5",
                },
                content_type="multipart/form-data",
            )

        self.assertEqual(200, response.status_code)
        self.assertEqual([{"speaker": "音色 1", "start": 0.0, "end": 1.0}], response.get_json())
        neural.assert_called_once()
        self.assertFalse(hasattr(server, "process_audio"))


if __name__ == "__main__":
    unittest.main()
