import { AppSettings } from './types';

export const BACKEND_URL = '';  // 空字符串表示使用当前域名，Vite proxy 会处理 /api

export const DEFAULT_SETTINGS: AppSettings = {
  minSegmentDuration: 0.5,
  backendUrl: '', // Empty to let getApiBaseUrl determine the URL (localhost for Electron)
  numSpeakers: 2,
  speakerLabels: {
    '音色1': '客服',
    '音色2': '客户',
  },
  silenceThreshold: 0.005,
  smoothingWidth: 5,
  sampleRate: 16000,
  minSilenceDuration: 0.5,
};

export const SPEAKER_COLORS = [
  'rgba(0, 122, 61, 0.5)',   // PSBC Green
  'rgba(242, 185, 31, 0.5)', // PSBC Gold
  'rgba(34, 197, 94, 0.5)',  // Green
  'rgba(239, 68, 68, 0.5)',  // Red
  'rgba(139, 92, 246, 0.5)', // Violet
  'rgba(236, 72, 153, 0.5)', // Pink
];

export const ACCEPTED_MIME_TYPES = {
  'audio/*': ['.mp3', '.wav', '.m4a', '.aac', '.ogg'],
  'video/*': ['.mp4', '.mov', '.webm'] 
};
