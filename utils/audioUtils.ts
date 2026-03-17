import { BACKEND_URL } from '../constants';

/**
 * 通过后端 API 提取音频片段，保持原文件格式
 */
export const extractAudioSegment = async (
  source: File | AudioBuffer,
  start: number,
  end: number,
  originalFileName: string
): Promise<Blob> => {
  // 如果 source 是 File，调用后端 API
  if (source instanceof File) {
    return extractAudioSegmentViaAPI(source, start, end, originalFileName);
  }

  // 如果是 AudioBuffer（来自 wavesurfer），回退到本地 WAV 导出
  return extractAudioSegmentFromBuffer(source, start, end);
};

/**
 * 调用后端 API 导出音频片段
 */
const extractAudioSegmentViaAPI = async (
  file: File,
  start: number,
  end: number,
  originalFileName: string
): Promise<Blob> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('start', start.toString());
  formData.append('end', end.toString());
  
  // 生成输出文件名
  const ext = originalFileName.split('.').pop() || 'wav';
  const baseName = originalFileName.replace(/\.[^/.]+$/, '');
  const outputFilename = `${baseName}_segment_${start.toFixed(1)}-${end.toFixed(1)}.${ext}`;
  formData.append('output_filename', outputFilename);

  const response = await fetch(`${BACKEND_URL}/export_segment`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: '导出失败' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.blob();
};

/**
 * 从 AudioBuffer 提取片段（本地 WAV 格式，作为后备）
 */
const extractAudioSegmentFromBuffer = async (
  audioBuffer: AudioBuffer,
  start: number,
  end: number
): Promise<Blob> => {
  const sampleRate = audioBuffer.sampleRate;
  const channels = audioBuffer.numberOfChannels;
  
  const startOffset = Math.floor(start * sampleRate);
  const endOffset = Math.floor(end * sampleRate);
  const frameCount = endOffset - startOffset;

  const offlineContext = new OfflineAudioContext(channels, frameCount, sampleRate);
  const newBuffer = offlineContext.createBuffer(channels, frameCount, sampleRate);

  for (let channel = 0; channel < channels; channel++) {
    const channelData = audioBuffer.getChannelData(channel);
    const newChannelData = newBuffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      newChannelData[i] = channelData[startOffset + i];
    }
  }

  return audioBufferToWav(newBuffer);
};

/**
 * AudioBuffer 转 WAV Blob
 */
const audioBufferToWav = (buffer: AudioBuffer): Blob => {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArray = new ArrayBuffer(length);
  const view = new DataView(bufferArray);
  let pos = 0;

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }

  function writeString(s: string) {
    for (let i = 0; i < s.length; i++) {
      view.setUint8(pos, s.charCodeAt(i));
      pos++;
    }
  }

  // write WAVE header
  writeString('RIFF');
  setUint32(length - 8);
  writeString('WAVE');

  writeString('fmt ');
  setUint32(16);
  setUint16(1); // PCM
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16);

  writeString('data');
  setUint32(length - pos - 4);

  // write interleaved data
  const channels = [];
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  let offset = 0;
  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([bufferArray], { type: 'audio/wav' });
};
