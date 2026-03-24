import { AppSettings } from './types';

export const BACKEND_URL = '';  // 空字符串表示使用当前域名，Vite proxy 会处理 /api

export const DEFAULT_SETTINGS: AppSettings = {
  minSegmentDuration: 0.5,
  backendUrl: '', // Empty to let getApiBaseUrl determine the URL (localhost for Electron)
  numSpeakers: 2,
  silenceThreshold: 0.005,
  smoothingWidth: 5,
  sampleRate: 16000,
  minSilenceDuration: 0.5,
};

export const SPEAKER_COLORS = [
  'rgba(59, 130, 246, 0.5)', // Blue
  'rgba(16, 185, 129, 0.5)', // Emerald
  'rgba(245, 158, 11, 0.5)', // Amber
  'rgba(239, 68, 68, 0.5)',  // Red
  'rgba(139, 92, 246, 0.5)', // Violet
  'rgba(236, 72, 153, 0.5)', // Pink
];

export const ACCEPTED_MIME_TYPES = {
  'audio/*': ['.mp3', '.wav', '.m4a', '.aac', '.ogg'],
  'video/*': ['.mp4', '.mov', '.webm'] 
};