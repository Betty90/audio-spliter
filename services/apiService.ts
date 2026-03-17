import { AudioSegment, AppSettings } from '../types';

export const analyzeAudio = async (
  file: File,
  settings: AppSettings
): Promise<AudioSegment[]> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('numSpeakers', settings.numSpeakers.toString());
  formData.append('minDuration', settings.minSegmentDuration.toString());
  // Mapping noise threshold to an RMS value roughly. 
  // In UI it might be seconds, but for backend logic let's treat it as amplitude threshold for this implementation
  // Or we stick to the backend logic. Let's send a rough RMS threshold.
  // 0.01 is a reasonable default for silence in RMS.
  formData.append('noiseThreshold', (settings.silenceThreshold || 0.005).toString()); 
  formData.append('smoothingWidth', (settings.smoothingWidth || 5).toString());
  formData.append('sampleRate', (settings.sampleRate || 16000).toString());
  formData.append('minSilenceDuration', (settings.minSilenceDuration !== undefined ? settings.minSilenceDuration : 0.1).toString());

  const backendUrl = settings.backendUrl.replace(/\/$/, ''); // Remove trailing slash

  let response;
  try {
    response = await fetch(`${backendUrl}/upload`, {
      method: 'POST',
      body: formData,
    });
  } catch (networkError) {
    console.error("Network request failed:", networkError);
    // Specifically handle the network failure (Failed to fetch)
    const port = backendUrl.split(':').pop() || '5001';
    
    // Detect if we are likely hitting a Mixed Content issue
    const isHttps = window.location.protocol === 'https:';
    const isLocalBackend = backendUrl.includes('localhost') || backendUrl.includes('127.0.0.1');
    const mixedContentWarning = isHttps && isLocalBackend 
        ? "\n⚠️ 您正在使用 HTTPS 访问网页，但后端是 HTTP。浏览器可能拦截了请求 (Mixed Content)。请检查地址栏拦截图标。"
        : "";

    throw new Error(`无法连接到后端服务 (${backendUrl})。${mixedContentWarning}\n\n请确保:\n1. 'python backend/server.py' 正在运行\n2. 端口 ${port} 未被占用`);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `服务器错误: ${response.status}`);
  }

  // Check if response is JSON
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("text/html")) {
      const text = await response.text();
      // Extract title if possible
      const titleMatch = text.match(/<title>(.*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1] : "Unknown HTML page";
      throw new Error(`服务器返回了 HTML 页面而不是 JSON。可能是后端地址配置错误，或者代理未生效。\n页面标题: ${title}`);
  }

  try {
    const rawSegments = await response.json();
    
    // Add IDs for frontend
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