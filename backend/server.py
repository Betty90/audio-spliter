import os
import uuid
import logging
import subprocess
import tempfile
import stat
import argparse
import signal
import sys

from flask import Flask, request, jsonify, send_file
import librosa
import numpy as np
from sklearn.cluster import KMeans
from sklearn.mixture import GaussianMixture
from sklearn.preprocessing import StandardScaler
import soundfile as sf
import io
from scipy.signal import medfilt
from scipy.ndimage import gaussian_filter1d
import traceback
import audioread

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)

app = Flask(__name__)


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response


# --- FFmpeg Configuration ---
# Find ffmpeg binary and add to PATH for librosa/audioread
def setup_ffmpeg():
    ffmpeg_path = "ffmpeg"  # Default to system ffmpeg

    # Get base directory - for PyInstaller bundled app, use sys._MEIPASS
    # otherwise use current working directory
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        # Running in a PyInstaller bundle
        base_dir = sys._MEIPASS
    else:
        # Running in a normal Python environment
        base_dir = os.getcwd()

    ffmpeg_names = ["ffmpeg.exe", "ffmpeg"]
    possible_dirs = [
        os.path.join(base_dir, "node_modules", "ffmpeg-static"),
        os.path.join(base_dir, "_internal", "node_modules", "ffmpeg-static"),
        os.path.join(os.getcwd(), "node_modules", "ffmpeg-static"),
        os.path.join(os.getcwd(), "..", "node_modules", "ffmpeg-static"),
        "/node_modules/ffmpeg-static",
        "/app/node_modules/ffmpeg-static",
    ]
    possible_paths = [
        os.path.join(directory, name)
        for directory in possible_dirs
        for name in ffmpeg_names
    ]

    found_path = None
    for path in possible_paths:
        if os.path.exists(path):
            found_path = path
            # Ensure executable
            try:
                st = os.stat(path)
                os.chmod(path, st.st_mode | stat.S_IEXEC)
            except Exception as e:
                logging.warning(f"Failed to chmod ffmpeg: {e}")
            break

    if found_path:
        logging.info(f"Found ffmpeg at: {found_path}")
        # Add directory to PATH so librosa/audioread can find it
        ffmpeg_dir = os.path.dirname(found_path)
        os.environ["PATH"] += os.pathsep + ffmpeg_dir

        # Verify ffmpeg works
        try:
            subprocess.run([found_path, "-version"], capture_output=True, check=True)
            logging.info("FFmpeg verified successfully.")
        except Exception as e:
            logging.error(f"FFmpeg found but failed to run: {e}")

        return found_path
    else:
        logging.warning(
            "FFmpeg binary not found in expected locations. Relying on system PATH."
        )
        # Verify system ffmpeg
        try:
            subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
            logging.info("System FFmpeg verified successfully.")
        except Exception as e:
            logging.error(f"System FFmpeg failed to run: {e}")

        return "ffmpeg"


FFMPEG_BINARY = setup_ffmpeg()

ALLOWED_TARGET_FORMATS = {"mp4", "m4a", "wav", "mp3", "aac", "ogg", "flac", "webm"}
ALLOWED_VIDEO_CODECS = {
    "source": None,
    "h264": "libx264",
    "h265": "libx265",
    "vp9": "libvpx-vp9",
}
ALLOWED_AUDIO_CODECS = {
    "source": None,
    "aac": "aac",
    "mp3": "libmp3lame",
    "wav": "pcm_s16le",
    "flac": "flac",
    "opus": "libopus",
}
ALLOWED_RESOLUTIONS = {"source", "3840x2160", "2560x1440", "1920x1080", "1280x720", "854x480"}
ALLOWED_FRAME_RATES = {"source", "60", "30", "25", "24"}
ALLOWED_VIDEO_BITRATES = {"source", "800", "1500", "2500", "5000", "8000"}
ALLOWED_SAMPLE_RATES = {"source", "16000", "22050", "44100", "48000"}
ALLOWED_CHANNELS = {"source": None, "mono": "1", "stereo": "2", "left": "pan=mono|c0=FL", "right": "pan=mono|c0=FR"}
ALLOWED_AUDIO_BITRATES = {"source", "96", "128", "192", "256", "320"}

# 设置上传文件临时存储路径
# 优先尝试 /tmp (Linux/Mac), 失败则使用当前目录下的 audio_uploads (Windows)
UPLOAD_FOLDER = "/tmp/audio_uploads"
if not os.path.exists(UPLOAD_FOLDER):
    try:
        os.makedirs(UPLOAD_FOLDER)
    except OSError:
        UPLOAD_FOLDER = os.path.join(os.getcwd(), "audio_uploads")
        if not os.path.exists(UPLOAD_FOLDER):
            os.makedirs(UPLOAD_FOLDER)

logging.info(f"Upload folder set to: {UPLOAD_FOLDER}")


def require_allowed(value, allowed, field_name):
    if value not in allowed:
        raise ValueError(f"Invalid {field_name}: {value}")
    return value


def build_convert_command(ffmpeg_path, input_path, output_path, form):
    target_format = require_allowed(
        (form.get("target_format") or form.get("targetFormat") or "mp4").lower(),
        ALLOWED_TARGET_FORMATS,
        "target_format",
    )
    video_codec = require_allowed(form.get("video_codec", "source"), ALLOWED_VIDEO_CODECS, "video_codec")
    resolution = require_allowed(form.get("resolution", "source"), ALLOWED_RESOLUTIONS, "resolution")
    frame_rate = require_allowed(form.get("frame_rate", "source"), ALLOWED_FRAME_RATES, "frame_rate")
    video_bitrate = require_allowed(form.get("video_bitrate", "source"), ALLOWED_VIDEO_BITRATES, "video_bitrate")
    audio_codec = require_allowed(form.get("audio_codec", "source"), ALLOWED_AUDIO_CODECS, "audio_codec")
    sample_rate = require_allowed(form.get("sample_rate", "source"), ALLOWED_SAMPLE_RATES, "sample_rate")
    channels = require_allowed(form.get("channels", "source"), ALLOWED_CHANNELS, "channels")
    audio_bitrate = require_allowed(form.get("audio_bitrate", "source"), ALLOWED_AUDIO_BITRATES, "audio_bitrate")

    cmd = [ffmpeg_path, "-i", input_path]

    video_encoder = ALLOWED_VIDEO_CODECS[video_codec]
    if video_encoder:
        cmd.extend(["-c:v", video_encoder])
        if video_encoder == "libx264":
            cmd.extend(["-preset", "medium", "-movflags", "+faststart"])

    if resolution != "source":
        width, height = resolution.split("x", 1)
        cmd.extend(["-vf", f"scale={width}:{height}"])

    if frame_rate != "source":
        cmd.extend(["-r", frame_rate])

    if video_bitrate != "source":
        cmd.extend(["-b:v", f"{video_bitrate}k"])

    audio_encoder = ALLOWED_AUDIO_CODECS[audio_codec]
    if audio_encoder:
        cmd.extend(["-c:a", audio_encoder])

    if sample_rate != "source":
        cmd.extend(["-ar", sample_rate])

    channel_value = ALLOWED_CHANNELS[channels]
    if channels in {"mono", "stereo"} and channel_value:
        cmd.extend(["-ac", channel_value])
    elif channels in {"left", "right"} and channel_value:
        cmd.extend(["-af", channel_value])

    if audio_bitrate != "source":
        cmd.extend(["-b:a", f"{audio_bitrate}k"])

    if audio_codec == "source" and target_format in {"mp3", "m4a", "aac"}:
        cmd.extend(["-c:a", "aac" if target_format in {"m4a", "aac"} else "libmp3lame"])

    cmd.extend(["-y", output_path])
    return cmd, target_format


def _unique_cluster_count(labels):
    return len(set(int(label) for label in labels))


def cluster_audio_features(features, n_clusters):
    try:
        gmm = GaussianMixture(
            n_components=n_clusters,
            covariance_type="diag",
            n_init=5,
            random_state=42,
        )
        labels = gmm.fit_predict(features)
        if n_clusters > 1 and _unique_cluster_count(labels) < 2:
            logging.warning(
                "GMM collapsed to one timbre label despite requested clusters; falling back to KMeans"
            )
            raise ValueError("GMM collapsed to one cluster")
        return labels
    except Exception as gmm_err:
        logging.warning(f"GMM failed ({gmm_err}), falling back to KMeans")
        kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        return kmeans.fit_predict(features)


def smooth_labels_preserving_clusters(labels, smoothing_width, n_clusters):
    kernel_size = smoothing_width if smoothing_width % 2 == 1 else smoothing_width + 1
    if kernel_size <= 1:
        return labels

    smoothed_labels = medfilt(labels, kernel_size=kernel_size)
    raw_count = _unique_cluster_count(labels)
    smoothed_count = _unique_cluster_count(smoothed_labels)

    if n_clusters > 1 and raw_count > 1 and smoothed_count < 2:
        logging.warning(
            "Median smoothing collapsed speaker labels; keeping unsmoothed labels to preserve timbre diversity"
        )
        return labels

    return smoothed_labels


def process_audio(
    file_path,
    n_clusters=2,
    min_duration=0.5,
    silence_thresh=0.005,
    hop_length=512,
    smoothing_width=5,
    sample_rate=16000,
    min_silence_duration=0.1,
):
    """
    使用 Librosa 提取 MFCC 特征，并使用 K-Means 聚类进行说话人区分。
    这是一个轻量级的机器学习方案，不需要 GPU。
    """
    try:
        logging.info(
            f"开始处理文件: {file_path}, 聚类数: {n_clusters}, hop_length: {hop_length}, smoothing: {smoothing_width}, sr: {sample_rate}, min_silence: {min_silence_duration}"
        )

        # 1. 加载音频
        try:
            y, sr = librosa.load(file_path, sr=sample_rate)
        except Exception as load_err:
            logging.error(f"Librosa load failed: {load_err}")

            # Check for NoBackendError specifically
            if "NoBackendError" in str(type(load_err).__name__):
                logging.error("FFmpeg backend not found by audioread.")

            # Try loading with soundfile directly if librosa fails (sometimes faster/better for wav)
            try:
                data, samplerate = sf.read(file_path)
                # Resample if needed
                if samplerate != sample_rate:
                    y = librosa.resample(
                        y=data.T, orig_sr=samplerate, target_sr=sample_rate
                    )
                    sr = sample_rate
                else:
                    y = data.T
                    sr = sample_rate
                # If stereo, convert to mono
                if len(y.shape) > 1:
                    y = librosa.to_mono(y)
            except Exception as sf_err:
                logging.error(f"Soundfile load failed: {sf_err}")
                raise ValueError(
                    f"无法加载音频文件 (可能是格式不支持或 FFmpeg 未安装): {str(load_err)}"
                )

        duration = librosa.get_duration(y=y, sr=sr)
        logging.info(f"音频时长: {duration:.2f}s")

        if duration < min_duration:
            logging.warning(f"音频过短 ({duration:.2f}s < {min_duration}s)，跳过处理")
            return []

        # 2. 特征提取 (MFCCs + Deltas)
        # 预加重 (Pre-emphasis) - 增强高频部分，有助于语音识别
        y_pre = librosa.effects.preemphasis(y)

        # hop_length 决定了时间分辨率。16k 采样率下 512 大约是 32ms 一个窗口
        # 增加 MFCC 系数到 20 以捕获更多细节
        n_mfcc = 20

        mfcc = librosa.feature.mfcc(
            y=y_pre, sr=sr, n_mfcc=n_mfcc, hop_length=hop_length
        )
        # 计算一阶差分 (Delta)
        mfcc_delta = librosa.feature.delta(mfcc)
        # 计算二阶差分 (Delta-Delta)
        mfcc_delta2 = librosa.feature.delta(mfcc, order=2)

        # 计算均方根能量 (RMS) 用于静音检测
        rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]

        # 堆叠特征: (3 * n_mfcc, n_samples)
        combined_features = np.vstack([mfcc, mfcc_delta, mfcc_delta2])

        # 转置矩阵形状为 (样本数, 特征数) 以适配 sklearn
        features = combined_features.T

        # Check if we have enough samples for clustering
        n_samples = features.shape[0]
        if n_samples == 0:
            logging.warning("No features extracted.")
            return []

        if n_samples < n_clusters:
            logging.warning(
                f"样本数 ({n_samples}) 小于聚类数 ({n_clusters})，自动调整聚类数。"
            )
            n_clusters = max(1, n_samples)

        # 3. 数据标准化 (Standardization)
        # 对聚类算法非常重要
        scaler = StandardScaler()
        scaled_features = scaler.fit_transform(features)

        # 3.1 特征平滑 (Feature Smoothing)
        # 在聚类之前对特征进行时间上的平滑，这相当于引入了上下文信息
        # sigma=2 大约对应 2-3 个帧的平滑窗口
        smoothed_features = gaussian_filter1d(scaled_features, sigma=2, axis=0)

        # 4. 聚类 (GMM - Gaussian Mixture Model)
        # GMM 比 K-Means 更适合说话人识别，因为它能更好地模拟每个说话人的特征分布（方差）
        # n_init=5 尝试多次初始化以避免局部最优
        labels = cluster_audio_features(smoothed_features, n_clusters)

        # 4.1 平滑标签 (Median Filter)
        # 使用中值滤波去除短暂的跳变
        labels = smooth_labels_preserving_clusters(labels, smoothing_width, n_clusters)

        # 5. 将帧标签转换为时间片段
        segments = []
        current_label = None
        start_frame = 0

        # 辅助函数：帧转秒
        frames_to_time = lambda f: librosa.frames_to_time(
            f, sr=sr, hop_length=hop_length
        )

        # Pre-calculate silence mask
        is_silent_mask = rms < silence_thresh

        # Apply min_silence_duration logic:
        # If a silence segment is shorter than min_silence_duration, treat it as non-silence (ignore it)
        # However, we don't know what speaker it belongs to.
        # Strategy:
        # 1. Identify runs of silence.
        # 2. If run length < min_frames, set is_silent_mask[run] = False.

        min_silence_frames = int(min_silence_duration * sr / hop_length)
        logging.info(
            f"Min silence duration: {min_silence_duration}s -> {min_silence_frames} frames"
        )

        silence_runs_found = 0
        silence_runs_filled = 0

        if min_silence_frames > 0:
            # Find runs of True in is_silent_mask
            run_start = -1
            for i in range(len(is_silent_mask)):
                if is_silent_mask[i]:
                    if run_start == -1:
                        run_start = i
                else:
                    if run_start != -1:
                        silence_runs_found += 1
                        run_length = i - run_start
                        if run_length < min_silence_frames:
                            silence_runs_filled += 1
                            # Too short, revert to False
                            is_silent_mask[run_start:i] = False
                            # Fill with previous label if available
                            if run_start > 0:
                                labels[run_start:i] = labels[run_start - 1]
                            # If no previous label (start of file), fill with next label
                            elif i < len(labels):
                                labels[run_start:i] = labels[i]
                        run_start = -1
            # Check last run
            if run_start != -1:
                silence_runs_found += 1
                run_length = len(is_silent_mask) - run_start
                if run_length < min_silence_frames:
                    silence_runs_filled += 1
                    is_silent_mask[run_start:] = False
                    if run_start > 0:
                        labels[run_start:] = labels[run_start - 1]

        logging.info(
            f"Silence filling: Found {silence_runs_found} runs, Filled {silence_runs_filled} runs"
        )

        segments_dropped_duration = 0

        for i, label in enumerate(labels):
            # 使用处理后的静音掩码
            is_silent = is_silent_mask[i]

            # 如果是静音，标记为 -1，否则使用聚类标签
            effective_label = -1 if is_silent else label

            # 状态发生变化（换人说话 或 开始/结束静音）
            if effective_label != current_label:
                if current_label is not None:
                    # 结束上一段
                    end_time = frames_to_time(i)
                    start_time = frames_to_time(start_frame)

                    # 只有当时长超过阈值才记录
                    if (end_time - start_time) >= min_duration:
                        # -1 代表噪音/静音
                        speaker_name = (
                            "噪音/静音"
                            if current_label == -1
                            else f"音色 {int(current_label) + 1}"
                        )

                        # 仅保留非静音片段（如果需要保留静音，去掉这个 if 即可）
                        if current_label != -1:
                            segments.append(
                                {
                                    "speaker": speaker_name,
                                    "start": float(f"{start_time:.2f}"),
                                    "end": float(f"{end_time:.2f}"),
                                }
                            )
                    else:
                        segments_dropped_duration += 1
                        # logging.debug(f"Dropped short segment: {start_time:.2f}-{end_time:.2f} ({end_time-start_time:.2f}s) Label: {current_label}")

                # 开始新的一段
                current_label = effective_label
                start_frame = i

        # 处理最后一段
        end_time = duration
        start_time = frames_to_time(start_frame)
        if (end_time - start_time) >= min_duration and current_label != -1:
            segments.append(
                {
                    "speaker": f"音色 {int(current_label) + 1}",
                    "start": float(f"{start_time:.2f}"),
                    "end": float(f"{end_time:.2f}"),
                }
            )
        elif (end_time - start_time) < min_duration:
            segments_dropped_duration += 1

        logging.info(
            f"处理完成，生成 {len(segments)} 个片段. Dropped {segments_dropped_duration} segments due to min_duration."
        )

        # 6. 后处理：合并同一说话人的相邻片段，如果间隔小于 min_silence_duration
        # 这可以解决由于短暂噪音或被丢弃的短片段导致的断裂
        if len(segments) > 0:
            merged_segments = []
            current_seg = segments[0]

            for next_seg in segments[1:]:
                # 检查是否同一说话人
                if current_seg["speaker"] == next_seg["speaker"]:
                    # 检查间隔
                    gap = next_seg["start"] - current_seg["end"]
                    # 使用 min_silence_duration 作为允许的最大合并间隔
                    # 注意：浮点数比较可能需要一点容差，但这里直接比较通常没问题
                    if gap < min_silence_duration:
                        # 合并：延长当前片段的结束时间
                        current_seg["end"] = next_seg["end"]
                        logging.info(
                            f"Merged segments of {current_seg['speaker']} with gap {gap:.2f}s"
                        )
                        continue

                # 如果不能合并，保存当前片段，并切换到下一个
                merged_segments.append(current_seg)
                current_seg = next_seg

            # 添加最后一个片段
            merged_segments.append(current_seg)

            if len(segments) != len(merged_segments):
                logging.info(
                    f"Post-processing merged {len(segments) - len(merged_segments)} gaps."
                )

            segments = merged_segments

        return segments

    except Exception as e:
        logging.error(f"处理音频时出错: {e}", exc_info=True)
        raise e


@app.route("/convert", methods=["POST"])
def convert_audio():
    if "file" not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files["file"]
    target_format = (
        request.form.get("target_format") or request.form.get("targetFormat") or "mp4"
    ).lower()

    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400

    temp_input = None
    temp_output = None

    try:
        # Create temp files
        input_ext = os.path.splitext(file.filename)[1]
        temp_input = tempfile.NamedTemporaryFile(delete=False, suffix=input_ext)
        file.save(temp_input.name)
        temp_input.close()

        temp_output = tempfile.NamedTemporaryFile(
            delete=False, suffix=f".{target_format}"
        )
        temp_output.close()

        cmd, target_format = build_convert_command(
            FFMPEG_BINARY,
            temp_input.name,
            temp_output.name,
            request.form,
        )

        # Run conversion with timeout
        logging.info(f"Starting conversion: {' '.join(cmd)}")
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=300
        )  # 5 min timeout

        if result.returncode != 0:
            logging.error(f"FFmpeg error: {result.stderr}")
            raise Exception(f"FFmpeg conversion failed: {result.stderr}")

        return send_file(
            temp_output.name,
            mimetype=f"audio/{target_format}"
            if target_format in ["mp3", "wav", "m4a"]
            else f"video/{target_format}",
            as_attachment=True,
            download_name=f"converted.{target_format}",
        )

    except subprocess.TimeoutExpired:
        logging.error("Conversion timed out")
        return jsonify({"error": "Conversion timed out"}), 504
    except ValueError as e:
        logging.error(f"Invalid conversion option: {str(e)}")
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logging.error(f"Conversion error: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        # Cleanup
        try:
            if temp_input and os.path.exists(temp_input.name):
                os.unlink(temp_input.name)
            # We don't delete output here because send_file needs it.
            # In a real app, use a background task to clean up old temp files.
        except Exception as e:
            logging.error(f"Cleanup error: {e}")


@app.route("/upload", methods=["POST", "OPTIONS"])
def upload_file():
    # Handle preflight CORS request
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    if "file" not in request.files:
        return jsonify({"error": "没有上传文件"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "未选择文件"}), 400

    # 获取前端传递的配置参数
    try:
        n_speakers = int(request.form.get("numSpeakers", 2))
        min_duration = float(request.form.get("minDuration", 0.5))
        # 前端传来的可能是字符串，转为浮点
        noise_threshold = float(request.form.get("noiseThreshold", 0.005))
        hop_length = int(request.form.get("hopLength", 512))
        smoothing_width = int(request.form.get("smoothingWidth", 5))
        sample_rate = int(request.form.get("sampleRate", 16000))
        min_silence_duration = float(request.form.get("minSilenceDuration", 0.1))
    except ValueError:
        return jsonify({"error": "配置参数无效"}), 400

    # 生成安全文件名
    filename = f"{uuid.uuid4()}_{file.filename}"
    filepath = os.path.join(UPLOAD_FOLDER, filename)

    try:
        logging.info(f"接收文件: {filename}")
        file.save(filepath)

        # 调用核心处理逻辑
        segments = process_audio(
            filepath,
            n_clusters=n_speakers,
            min_duration=min_duration,
            silence_thresh=noise_threshold,
            hop_length=hop_length,
            smoothing_width=smoothing_width,
            sample_rate=sample_rate,
            min_silence_duration=min_silence_duration,
        )

        # 处理完成后删除临时文件
        if os.path.exists(filepath):
            os.remove(filepath)

        return jsonify(segments)

    except Exception as e:
        # 发生错误也要清理文件
        if os.path.exists(filepath):
            os.remove(filepath)
        # Log the full error to server console
        error_trace = traceback.format_exc()
        logging.error(f"Server Internal Error: {error_trace}")
        return jsonify(
            {"error": f"Internal Server Error: {str(e)}\n\nTraceback:\n{error_trace}"}
        ), 500


@app.route("/export_segment", methods=["POST", "OPTIONS"])
def export_segment():
    """
    导出音频片段，支持声道选择和格式保持
    前端传递: file (上传的原始音频文件), start, end, output_filename, channels (both/left/right)
    """
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    if "file" not in request.files:
        return jsonify({"error": "没有上传文件"}), 400

    uploaded_file = request.files["file"]
    if uploaded_file.filename == "":
        return jsonify({"error": "未选择文件"}), 400

    # 获取起止时间
    try:
        start = float(request.form.get("start", 0))
        end = float(request.form.get("end", 0))
        if start >= end:
            return jsonify({"error": "开始时间必须小于结束时间"}), 400
    except ValueError:
        return jsonify({"error": "时间参数无效"}), 400

    # 获取声道选项
    channels = request.form.get("channels", "both")
    if channels not in ["both", "left", "right"]:
        channels = "both"

    temp_input = None
    temp_output = None

    try:
        # 保存上传的文件到临时位置
        input_ext = os.path.splitext(uploaded_file.filename)[1]
        temp_input = tempfile.NamedTemporaryFile(delete=False, suffix=input_ext)
        uploaded_file.save(temp_input.name)
        temp_input.close()

        # 生成输出文件名（保持原扩展名）
        output_filename = request.form.get("output_filename", f"segment{input_ext}")
        output_ext = os.path.splitext(output_filename)[1] or input_ext
        temp_output = tempfile.NamedTemporaryFile(delete=False, suffix=output_ext)
        temp_output.close()

        # 构建 FFmpeg 命令
        ffmpeg_path = FFMPEG_BINARY
        duration = end - start

        # 判断是否为有损格式
        lossy_formats = [".mp3", ".m4a", ".aac", ".ogg", ".wma"]
        is_lossy = output_ext.lower() in lossy_formats

        # 获取原始音频参数
        original_info = get_audio_info(temp_input.name)

        cmd = [
            ffmpeg_path,
            "-i",
            temp_input.name,
            "-ss",
            str(start),
            "-t",
            str(duration),
        ]

        # 声道处理
        if channels == "left":
            cmd.extend(["-af", "pan=mono|c0=FL"])  # 仅左声道
        elif channels == "right":
            cmd.extend(["-af", "pan=mono|c0=FR"])  # 仅右声道

        # 编码设置 - 保持原格式参数
        if is_lossy:
            # 有损格式：使用高质量重新编码，保持原始采样率和码率
            cmd.extend(["-c:a", "libmp3lame", "-q:a", "2"])
            # 保持原始采样率
            if original_info and original_info.get("sample_rate"):
                cmd.extend(["-ar", str(original_info["sample_rate"])])
        else:
            # 无损格式：直接复制流
            cmd.extend(["-c", "copy"])
            # 如果需要声道处理，则不能直接用 copy
            if channels != "both":
                cmd = [
                    ffmpeg_path,
                    "-i",
                    temp_input.name,
                    "-ss",
                    str(start),
                    "-t",
                    str(duration),
                ]
                if channels == "left":
                    cmd.extend(["-af", "pan=mono|c0=FL"])
                elif channels == "right":
                    cmd.extend(["-af", "pan=mono|c0=FR"])
                # 使用 PCM 格式保持无损
                cmd.extend(["-c:a", "pcm_s16le"])
                if original_info and original_info.get("sample_rate"):
                    cmd.extend(["-ar", str(original_info["sample_rate"])])

        cmd.extend(["-y", temp_output.name])

        # 执行 FFmpeg
        logging.info(f"Exporting segment: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

        if result.returncode != 0:
            logging.error(f"FFmpeg export error: {result.stderr}")
            return jsonify({"error": f"导出失败: {result.stderr}"}), 500

        return send_file(
            temp_output.name,
            mimetype=get_mime_type(output_ext),
            as_attachment=True,
            download_name=output_filename,
        )

    except subprocess.TimeoutExpired:
        logging.error("Export timed out")
        return jsonify({"error": "导出超时"}), 504
    except Exception as e:
        logging.error(f"Export error: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        # 清理输入临时文件
        if temp_input and os.path.exists(temp_input.name):
            try:
                os.unlink(temp_input.name)
            except Exception as e:
                logging.error(f"Cleanup input error: {e}")
        # 注意：输出文件由 send_file 处理，这里不删除


def get_mime_type(ext):
    mime_types = {
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".m4a": "audio/mp4",
        ".mp4": "audio/mp4",
        ".aac": "audio/aac",
        ".ogg": "audio/ogg",
        ".flac": "audio/flac",
        ".webm": "audio/webm",
        ".wma": "audio/x-ms-wma",
    }
    return mime_types.get(ext.lower(), "audio/wav")


def get_audio_info(file_path):
    try:
        cmd = [FFMPEG_BINARY, "-i", file_path]
        result = subprocess.run(cmd, capture_output=True, text=True)
        output = result.stderr

        info = {}

        import re

        sample_rate_match = re.search(r"(\d+) Hz", output)
        if sample_rate_match:
            info["sample_rate"] = int(sample_rate_match.group(1))

        channels_match = re.search(r"(\d+) channels?", output)
        if channels_match:
            info["channels"] = int(channels_match.group(1))

        bitrate_match = re.search(r"(\d+) kb/s", output)
        if bitrate_match:
            info["bitrate"] = int(bitrate_match.group(1))

        return info
    except Exception as e:
        logging.error(f"Failed to get audio info: {e}")
        return None


@app.route("/debug", methods=["GET"])
def debug_info():
    return jsonify(
        {
            "ffmpeg_binary": FFMPEG_BINARY,
            "upload_folder": UPLOAD_FOLDER,
            "path": os.environ.get("PATH"),
            "cwd": os.getcwd(),
        }
    )


# Global variable to store the actual port
_server_port = None


def signal_handler(signum, frame):
    """Handle SIGTERM and SIGINT gracefully"""
    logging.info(f"Received signal {signum}, shutting down gracefully...")
    sys.exit(0)


# Register signal handlers
signal.signal(signal.SIGTERM, signal_handler)
signal.signal(signal.SIGINT, signal_handler)


@app.route("/health", methods=["GET", "OPTIONS"])
def health():
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200
    return jsonify(
        {
            "status": "ok",
            "message": "Python audio service is running",
            "port": _server_port,
        }
    )


if __name__ == "__main__":
    # Parse command line arguments
    parser = argparse.ArgumentParser(description="AudioSlicer AI Backend Server")
    parser.add_argument(
        "-p",
        "--port",
        type=int,
        default=None,
        help="Port to run the server on (0 for dynamic port)",
    )
    args = parser.parse_args()

    # Determine port: command line arg > environment variable > default (5001)
    if args.port is not None:
        PORT = args.port
    else:
        PORT = int(os.environ.get("PORT", 5001))

    is_dynamic_port = PORT == 0

    if is_dynamic_port:
        print("Server starting on dynamic port...", flush=True)
    else:
        print(f"Server starting on http://0.0.0.0:{PORT}")
        print(f"Ensure your frontend connects to http://127.0.0.1:{PORT}")
        _server_port = PORT

    if is_dynamic_port:
        from werkzeug.serving import make_server

        server = make_server("0.0.0.0", 0, app)
        actual_port = server.port
        _server_port = actual_port
        print(f"READY http://127.0.0.1:{actual_port}", flush=True)
        print(actual_port, flush=True)
        server.serve_forever()
    else:
        # Disable debug mode when running as PyInstaller bundle
        # to avoid reloader issues with internal arguments
        is_frozen = getattr(sys, "frozen", False)
        app.run(debug=not is_frozen, host="0.0.0.0", port=PORT)
