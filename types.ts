export interface AudioSegment {
  id: string;
  speaker: string;
  start: number;
  end: number;
  color?: string;
  remark?: string;
}

export type WorkspaceTab = 'analyzer' | 'splitter' | 'converter';

export type LibraryCategory = 'all' | 'recent' | 'favorites' | 'trash';

export type LibraryStatus = 'idle' | 'analyzing' | 'analyzed' | 'error' | 'deleted';

export interface LibraryCollection {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
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
  segment1Index?: number;
  segment2Index?: number;
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
  size?: number;
  path?: string;
  extension?: string;
  isFavorite?: boolean;
  isDeleted?: boolean;
  collectionIds?: string[];
  addedAt?: number;
  updatedAt?: number;
  lastAnalyzedAt?: number;
  settings?: AppSettings;
}

export interface LibraryItem {
  id: string;
  name: string;
  path: string;
  size: number;
  duration?: number;
  extension: string;
  status: LibraryStatus;
  segmentCount: number;
  avgLatency?: number;
  isFavorite: boolean;
  isDeleted: boolean;
  collectionIds: string[];
  addedAt: number;
  updatedAt: number;
  lastAnalyzedAt?: number;
  error?: string;
  segments?: AudioSegment[];
}

export interface OutputPolicy {
  directory: string;
  naming: 'preserve' | 'prefix' | 'suffix';
  existingFile: 'auto-rename' | 'overwrite';
  afterConversion: 'none' | 'reveal';
}

export interface ConversionSettings {
  targetFormat: 'mp4' | 'm4a' | 'wav' | 'mp3' | 'aac' | 'ogg' | 'flac' | 'webm';
  videoCodec: 'source' | 'h264' | 'h265' | 'vp9';
  resolution: 'source' | '3840x2160' | '2560x1440' | '1920x1080' | '1280x720' | '854x480';
  frameRate: 'source' | '60' | '30' | '25' | '24';
  videoBitrate: 'source' | '800' | '1500' | '2500' | '5000' | '8000';
  audioCodec: 'source' | 'aac' | 'mp3' | 'wav' | 'flac' | 'opus';
  sampleRate: 'source' | '16000' | '22050' | '44100' | '48000';
  channels: 'source' | 'mono' | 'stereo' | 'left' | 'right';
  audioBitrate: 'source' | '96' | '128' | '192' | '256' | '320';
}

export interface PersistedAppState {
  version: 1;
  library: LibraryItem[];
  collections: LibraryCollection[];
  outputPolicy: OutputPolicy;
  conversionSettings: ConversionSettings;
  activeCategory?: LibraryCategory;
  activeCollectionId?: string | null;
}

export interface StorageStats {
  path: string;
  free: number;
  total: number;
  used: number;
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
