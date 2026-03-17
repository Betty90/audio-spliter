export interface AudioSegment {
  id: string;
  speaker: string;
  start: number;
  end: number;
  color?: string;
  remark?: string;
}

export interface LatencyRow {
  segment1End: number;
  segment2Start: number;
  latency: number;
  fileName: string;
  speakerFrom: string;
  speakerTo: string;
  // Add IDs to track source segments
  segment1Id: string;
  segment2Id: string;
  remark?: string;
}

export enum FileStatus {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  ANALYZING = 'ANALYZING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export interface AudioFile {
  id: string;
  file: File;
  name: string;
  blobUrl: string;
  status: FileStatus;
  segments: AudioSegment[];
  avgLatency?: number;
  error?: string;
  duration?: number;
  settings?: AppSettings;
}

export interface AppSettings {
  minSegmentDuration: number; // ignore blips smaller than this
  backendUrl: string;
  numSpeakers: number; // For K-Means clustering
  silenceThreshold: number; // RMS threshold for silence detection
  smoothingWidth: number; // Median filter kernel size (odd number)
  sampleRate: number; // Audio sample rate (16000, 22050, 44100)
  minSilenceDuration: number; // Minimum silence duration to be considered as a split point
}
