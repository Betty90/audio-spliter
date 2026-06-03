import { AudioSegment, AppSettings, ConversionSettings } from '../types';

let cachedPort: number | null = null;
let portPromise: Promise<number> | null = null;

const PORT_TIMEOUT = 30000;

async function getPythonPort(): Promise<number> {
  if (cachedPort !== null) {
    return cachedPort;
  }

  if (portPromise !== null) {
    return portPromise;
  }

  portPromise = new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Timeout waiting for Python port from Electron'));
    }, PORT_TIMEOUT);

    if (typeof window !== 'undefined' && window.electron?.getPythonPort) {
      window.electron.getPythonPort()
        .then((port: number) => {
          clearTimeout(timeoutId);
          cachedPort = port;
          resolve(port);
        })
        .catch((error: Error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    } else {
      clearTimeout(timeoutId);
      reject(new Error('Electron API not available'));
    }
  });

  return portPromise;
}

async function getApiBaseUrl(settings?: AppSettings): Promise<string> {
  if (
    settings?.backendUrl &&
    settings.backendUrl !== 'auto' &&
    settings.backendUrl !== '/api'
  ) {
    return settings.backendUrl.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined' && window.electron?.getPythonPort) {
    try {
      const port = await getPythonPort();
      return `http://127.0.0.1:${port}`;
    } catch {
      return 'http://127.0.0.1:5001';
    }
  }

  return 'http://127.0.0.1:5001';
}

export const checkHealth = async (settings?: AppSettings): Promise<{ status: string }> => {
  const backendUrl = await getApiBaseUrl(settings);
  const response = await fetch(`${backendUrl}/health`, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }

  return response.json();
};

export const analyzeAudio = async (
  file: File,
  settings: AppSettings
): Promise<AudioSegment[]> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('numSpeakers', settings.numSpeakers.toString());
  formData.append('minDuration', settings.minSegmentDuration.toString());
  formData.append('noiseThreshold', (settings.silenceThreshold || 0.005).toString());
  formData.append('smoothingWidth', (settings.smoothingWidth || 5).toString());
  formData.append('sampleRate', (settings.sampleRate || 16000).toString());
  formData.append('minSilenceDuration', (settings.minSilenceDuration !== undefined ? settings.minSilenceDuration : 0.1).toString());

  const backendUrl = await getApiBaseUrl(settings);

  let response;
  try {
    response = await fetch(`${backendUrl}/upload`, {
      method: 'POST',
      body: formData,
    });
  } catch (networkError) {
    console.error("Network request failed:", networkError);
    const port = cachedPort || 5001;

    const isHttps = window.location.protocol === 'https:';
    const isLocalBackend = backendUrl.includes('localhost') || backendUrl.includes('127.0.0.1');
    const mixedContentWarning = isHttps && isLocalBackend
        ? "\n⚠️ 您正在使用 HTTPS 访问网页，但后端是 HTTP。浏览器可能拦截了请求 (Mixed Content)。请检查地址栏拦截图标。"
        : "";

    throw new Error(`无法连接到后端服务 (${backendUrl})。${mixedContentWarning}\n\n请确保:\n1. Electron 管理的 Python 后端已启动\n2. 端口 ${port} 未被占用`);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `服务器错误: ${response.status}`);
  }

  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("text/html")) {
      const text = await response.text();
      const titleMatch = text.match(/<title>(.*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1] : "Unknown HTML page";
      throw new Error(`服务器返回了 HTML 页面而不是 JSON。可能是后端地址配置错误，或者代理未生效。\n页面标题: ${title}`);
  }

  try {
    const rawSegments = await response.json();

    return rawSegments.map((s: any, index: number) => ({
      id: `seg-${Date.now()}-${index}`,
      speaker: s.speaker,
      start: s.start,
      end: s.end,
    }));
  } catch (parseError) {
    console.error("JSON Parse Error:", parseError);
    throw new Error("服务器响应格式错误");
  }
};

export const exportSegment = async (
  file: File,
  start: number,
  end: number,
  speaker: string,
  settings?: AppSettings
): Promise<Blob> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('start', start.toString());
  formData.append('end', end.toString());
  formData.append('speaker', speaker);

  const backendUrl = await getApiBaseUrl(settings);

  const response = await fetch(`${backendUrl}/export_segment`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `导出失败: ${response.status}`);
  }

  return response.blob();
};

export const convertAudio = async (
  file: File,
  outputFormat: string,
  conversionSettings?: Partial<ConversionSettings>,
  settings?: AppSettings
): Promise<Blob> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('target_format', outputFormat);
  formData.append('targetFormat', outputFormat);

  if (conversionSettings) {
    formData.append('video_codec', conversionSettings.videoCodec || 'source');
    formData.append('resolution', conversionSettings.resolution || 'source');
    formData.append('frame_rate', conversionSettings.frameRate || 'source');
    formData.append('video_bitrate', conversionSettings.videoBitrate || 'source');
    formData.append('audio_codec', conversionSettings.audioCodec || 'source');
    formData.append('sample_rate', conversionSettings.sampleRate || 'source');
    formData.append('channels', conversionSettings.channels || 'source');
    formData.append('audio_bitrate', conversionSettings.audioBitrate || 'source');
  }

  const backendUrl = await getApiBaseUrl(settings);

  const response = await fetch(`${backendUrl}/convert`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `转换失败: ${response.status}`);
  }

  return response.blob();
};
