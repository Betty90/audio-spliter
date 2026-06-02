import logging
import os
import subprocess
import sys
from dataclasses import dataclass
from typing import Optional

import numpy as np
import soundfile as sf


SAMPLE_RATE = 16000
SILERO_MODEL_NAME = "silero_vad.onnx"
CAMPLUS_MODEL_NAME = "campplus_cn_en_common_200k.onnx"

_DEFAULT_DIARIZER = None


class ModelUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class SpeechRegion:
    start: float
    end: float


def _runtime_base_dir():
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return sys._MEIPASS
    return os.getcwd()


def resolve_model_path(filename, explicit_path=None):
    candidates = []
    if explicit_path:
        candidates.append(explicit_path)

    env_name = "SILERO_VAD_ONNX" if filename == SILERO_MODEL_NAME else "CAMPLUS_ONNX"
    env_path = os.environ.get(env_name)
    if env_path:
        candidates.append(env_path)

    models_dir = os.environ.get("AUDIO_SLICER_MODELS_DIR")
    if models_dir:
        candidates.append(os.path.join(models_dir, filename))

    base_dir = _runtime_base_dir()
    candidates.extend(
        [
            os.path.join(base_dir, "models", filename),
            os.path.join(base_dir, "_internal", "models", filename),
            os.path.join(os.getcwd(), "backend", "models", filename),
            os.path.join(os.getcwd(), "models", filename),
        ]
    )

    for path in candidates:
        if path and os.path.exists(path):
            return path

    raise ModelUnavailable(f"ONNX model not found: {filename}")


def _resample_linear(audio, orig_sr, target_sr):
    if orig_sr == target_sr or len(audio) == 0:
        return np.asarray(audio, dtype=np.float32)

    duration = len(audio) / float(orig_sr)
    target_length = max(1, int(round(duration * target_sr)))
    source_positions = np.linspace(0.0, duration, num=len(audio), endpoint=False)
    target_positions = np.linspace(0.0, duration, num=target_length, endpoint=False)
    return np.interp(target_positions, source_positions, audio).astype(np.float32)


def _load_audio_with_ffmpeg(file_path):
    cmd = [
        "ffmpeg",
        "-v",
        "error",
        "-i",
        file_path,
        "-ac",
        "1",
        "-ar",
        str(SAMPLE_RATE),
        "-f",
        "f32le",
        "-",
    ]
    result = subprocess.run(cmd, capture_output=True, check=True)
    return np.frombuffer(result.stdout, dtype=np.float32), SAMPLE_RATE


def load_audio_16k(file_path):
    try:
        audio, sr = sf.read(file_path, dtype="float32", always_2d=False)
        if audio.ndim > 1:
            audio = np.mean(audio, axis=1)
        if sr != SAMPLE_RATE:
            audio = _resample_linear(audio, orig_sr=sr, target_sr=SAMPLE_RATE)
        return np.asarray(audio, dtype=np.float32), SAMPLE_RATE
    except Exception:
        return _load_audio_with_ffmpeg(file_path)


def _l2_normalize(vector):
    norm = np.linalg.norm(vector)
    if norm <= 1e-12:
        return vector
    return vector / norm


def _remap_labels_by_first_seen(labels):
    mapping = {}
    remapped = []
    for label in labels:
        label = int(label)
        if label not in mapping:
            mapping[label] = len(mapping)
        remapped.append(mapping[label])
    return remapped


def _merge_adjacent_segments(segments, max_gap):
    if not segments:
        return []

    merged = [segments[0].copy()]
    for segment in segments[1:]:
        previous = merged[-1]
        if previous["speaker"] == segment["speaker"] and segment["start"] - previous["end"] < max_gap:
            previous["end"] = segment["end"]
        else:
            merged.append(segment.copy())
    return merged


def cluster_embeddings(embeddings, n_clusters, max_iter=50):
    matrix = np.asarray(embeddings, dtype=np.float32)
    if matrix.ndim != 2 or matrix.shape[0] == 0:
        return []

    n_clusters = min(max(1, int(n_clusters)), matrix.shape[0])
    if n_clusters == 1:
        return [0] * matrix.shape[0]

    centers = [matrix[0]]
    while len(centers) < n_clusters:
        stacked = np.stack(centers)
        distances = np.min(
            np.sum((matrix[:, np.newaxis, :] - stacked[np.newaxis, :, :]) ** 2, axis=2),
            axis=1,
        )
        centers.append(matrix[int(np.argmax(distances))])
    centers = np.stack(centers)

    labels = np.zeros(matrix.shape[0], dtype=np.int64)
    for _ in range(max_iter):
        distances = np.sum(
            (matrix[:, np.newaxis, :] - centers[np.newaxis, :, :]) ** 2,
            axis=2,
        )
        next_labels = np.argmin(distances, axis=1)
        if np.array_equal(labels, next_labels):
            break
        labels = next_labels
        for cluster_index in range(n_clusters):
            members = matrix[labels == cluster_index]
            if len(members) > 0:
                centers[cluster_index] = members.mean(axis=0)

    return _remap_labels_by_first_seen(labels)


class SileroOnnxVad:
    def __init__(self, model_path):
        try:
            import onnxruntime as ort
        except Exception as exc:
            raise ModelUnavailable("onnxruntime is required for Silero VAD") from exc

        opts = ort.SessionOptions()
        opts.inter_op_num_threads = 1
        opts.intra_op_num_threads = 1
        self.session = ort.InferenceSession(
            model_path,
            sess_options=opts,
            providers=["CPUExecutionProvider"],
        )
        self.input_names = {item.name for item in self.session.get_inputs()}
        self.reset_states()

    def reset_states(self, batch_size=1):
        self._state = np.zeros((2, batch_size, 128), dtype=np.float32)
        self._h = np.zeros((2, batch_size, 64), dtype=np.float32)
        self._c = np.zeros((2, batch_size, 64), dtype=np.float32)
        self._context = np.zeros((batch_size, 0), dtype=np.float32)
        self._last_batch_size = batch_size

    def probability(self, chunk):
        chunk = np.asarray(chunk, dtype=np.float32).reshape(1, -1)
        if chunk.shape[1] != 512:
            raise ValueError("Silero VAD expects 512 samples at 16 kHz")

        if "state" in self.input_names:
            if self._context.shape[1] == 0:
                self._context = np.zeros((chunk.shape[0], 64), dtype=np.float32)
            model_input = np.concatenate([self._context, chunk], axis=1)
            outputs = self.session.run(
                None,
                {
                    "input": model_input,
                    "state": self._state,
                    "sr": np.array(SAMPLE_RATE, dtype=np.int64),
                },
            )
            speech_probability, self._state = outputs[0], outputs[1]
            self._context = model_input[:, -64:]
        elif {"h", "c"}.issubset(self.input_names):
            outputs = self.session.run(
                None,
                {
                    "input": chunk,
                    "sr": np.array(SAMPLE_RATE, dtype=np.int64),
                    "h": self._h,
                    "c": self._c,
                },
            )
            speech_probability, self._h, self._c = outputs[0], outputs[1], outputs[2]
        else:
            raise ModelUnavailable("Unsupported Silero VAD ONNX input signature")

        return float(np.ravel(speech_probability)[0])

    def speech_regions(
        self,
        audio,
        threshold=0.5,
        min_speech_duration_ms=250,
        min_silence_duration_ms=100,
        speech_pad_ms=30,
    ):
        audio = np.asarray(audio, dtype=np.float32)
        self.reset_states()
        window_size = 512
        probabilities = []

        for start in range(0, len(audio), window_size):
            chunk = audio[start : start + window_size]
            if len(chunk) < window_size:
                chunk = np.pad(chunk, (0, window_size - len(chunk)))
            probabilities.append(self.probability(chunk))

        regions = []
        triggered = False
        current_start = 0
        temp_end = 0
        neg_threshold = max(threshold - 0.15, 0.01)
        min_speech_samples = SAMPLE_RATE * min_speech_duration_ms / 1000
        min_silence_samples = SAMPLE_RATE * min_silence_duration_ms / 1000
        speech_pad_samples = int(SAMPLE_RATE * speech_pad_ms / 1000)

        for index, probability in enumerate(probabilities):
            sample = index * window_size
            if probability >= threshold and not triggered:
                triggered = True
                current_start = sample
                temp_end = 0
                continue

            if probability >= threshold and temp_end:
                temp_end = 0

            if probability < neg_threshold and triggered:
                if not temp_end:
                    temp_end = sample
                if sample - temp_end < min_silence_samples:
                    continue
                if temp_end - current_start >= min_speech_samples:
                    regions.append((current_start, temp_end))
                triggered = False
                temp_end = 0

        if triggered and len(audio) - current_start >= min_speech_samples:
            regions.append((current_start, len(audio)))

        padded_regions = []
        for index, (start, end) in enumerate(regions):
            padded_start = max(0, start - speech_pad_samples)
            padded_end = min(len(audio), end + speech_pad_samples)
            if index > 0 and padded_start < padded_regions[-1].end * SAMPLE_RATE:
                previous_end = int(padded_regions[-1].end * SAMPLE_RATE)
                midpoint = (previous_end + padded_start) // 2
                padded_regions[-1] = SpeechRegion(
                    start=padded_regions[-1].start,
                    end=round(midpoint / SAMPLE_RATE, 2),
                )
                padded_start = midpoint
            padded_regions.append(
                SpeechRegion(
                    start=round(padded_start / SAMPLE_RATE, 2),
                    end=round(padded_end / SAMPLE_RATE, 2),
                )
            )
        return padded_regions


class CampPlusOnnxEmbedder:
    def __init__(self, model_path):
        try:
            import kaldi_native_fbank as knf
            import onnxruntime as ort
        except Exception as exc:
            raise ModelUnavailable(
                "onnxruntime and kaldi-native-fbank are required for CAM++ embeddings"
            ) from exc

        opts = ort.SessionOptions()
        opts.inter_op_num_threads = 1
        opts.intra_op_num_threads = 1
        self.session = ort.InferenceSession(
            model_path,
            sess_options=opts,
            providers=["CPUExecutionProvider"],
        )
        self.input_name = self.session.get_inputs()[0].name
        self._knf = knf

    def _fbank(self, audio):
        opts = self._knf.FbankOptions()
        opts.frame_opts.samp_freq = SAMPLE_RATE
        opts.frame_opts.dither = 0.0
        opts.mel_opts.num_bins = 80
        extractor = self._knf.OnlineFbank(opts)
        extractor.accept_waveform(SAMPLE_RATE, np.asarray(audio, dtype=np.float32) * 32768.0)
        extractor.input_finished()

        if extractor.num_frames_ready == 0:
            raise ValueError("No fbank frames produced for speech segment")

        frames = np.stack(
            [extractor.get_frame(i) for i in range(extractor.num_frames_ready)]
        ).astype(np.float32)
        frames -= frames.mean(axis=0, keepdims=True)
        return frames

    def embedding(self, audio):
        frames = self._fbank(audio)
        output = self.session.run(None, {self.input_name: frames[np.newaxis, :, :]})[0][0]
        return _l2_normalize(np.asarray(output, dtype=np.float32))


class NeuralDiarizer:
    def __init__(
        self,
        vad_model_path,
        embedding_model_path,
        vad: Optional[SileroOnnxVad] = None,
        embedder: Optional[CampPlusOnnxEmbedder] = None,
    ):
        self.vad = vad
        self.embedder = embedder
        self.vad_model_path = vad_model_path
        self.embedding_model_path = embedding_model_path

    def _vad(self):
        if self.vad is None:
            self.vad = SileroOnnxVad(self.vad_model_path)
        return self.vad

    def _embedder(self):
        if self.embedder is None:
            self.embedder = CampPlusOnnxEmbedder(self.embedding_model_path)
        return self.embedder

    def _speech_regions(self, audio, min_duration, min_silence_duration):
        return self._vad().speech_regions(
            audio,
            min_speech_duration_ms=max(100, int(min_duration * 1000)),
            min_silence_duration_ms=max(50, int(min_silence_duration * 1000)),
        )

    def _embedding(self, audio):
        return self._embedder().embedding(audio)

    def analyze(
        self,
        file_path,
        num_speakers=2,
        min_duration=0.5,
        min_silence_duration=0.5,
    ):
        audio, sr = load_audio_16k(file_path)
        if sr != SAMPLE_RATE:
            raise ValueError("Neural diarizer expects 16 kHz audio")

        speech_regions = [
            region
            for region in self._speech_regions(audio, min_duration, min_silence_duration)
            if region.end - region.start >= min_duration
        ]
        if not speech_regions:
            return []

        embeddings = []
        kept_regions = []
        for region in speech_regions:
            start = int(region.start * SAMPLE_RATE)
            end = int(region.end * SAMPLE_RATE)
            if end <= start:
                continue
            embeddings.append(self._embedding(audio[start:end]))
            kept_regions.append(region)

        if not embeddings:
            return []

        speaker_count = min(max(1, int(num_speakers)), len(embeddings))
        if speaker_count == 1:
            labels = [0] * len(embeddings)
        else:
            matrix = np.vstack(embeddings)
            labels = cluster_embeddings(matrix, speaker_count)

        segments = []
        for region, label in zip(kept_regions, labels):
            segments.append(
                {
                    "speaker": f"音色 {int(label) + 1}",
                    "start": float(f"{region.start:.2f}"),
                    "end": float(f"{region.end:.2f}"),
                }
            )

        return _merge_adjacent_segments(segments, min_silence_duration)


def create_default_diarizer():
    global _DEFAULT_DIARIZER
    if _DEFAULT_DIARIZER is None:
        _DEFAULT_DIARIZER = NeuralDiarizer(
            vad_model_path=resolve_model_path(SILERO_MODEL_NAME),
            embedding_model_path=resolve_model_path(CAMPLUS_MODEL_NAME),
        )
    return _DEFAULT_DIARIZER


def process_audio_neural(
    file_path,
    n_clusters,
    min_duration,
    min_silence_duration,
):
    diarizer = create_default_diarizer()
    logging.info("Analyzing audio with bundled Silero VAD + CAM++ ONNX models")
    return diarizer.analyze(
        file_path,
        num_speakers=n_clusters,
        min_duration=min_duration,
        min_silence_duration=min_silence_duration,
    )
