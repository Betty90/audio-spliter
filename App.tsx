import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AlertCircle, AudioWaveform, Clock3, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import {
  AppSettings,
  AudioFile,
  AudioSegment,
  ConversionSettings,
  FileStatus,
  LibraryCategory,
  LibraryCollection,
  LibraryItem,
  LatencyRow,
  OutputPolicy,
  PersistedAppState,
  WorkspaceTab,
} from './types';
import { analyzeAudio, checkHealth as checkBackendHealth } from './services/apiService';
import { DEFAULT_SETTINGS } from './constants';
import SettingsModal from './components/SettingsModal';
import LabModal from './components/LabModal';
import WaveformSidebar from './components/WaveformSidebar';
import AudioFileSidebar from './components/AudioFileSidebar';
import AnalysisTable from './components/AnalysisTable';
import ConverterPage from './components/ConverterPage';
import SplitterPage from './components/SplitterPage';
import ConfirmDialog, { ConfirmConfig } from './components/ConfirmDialog';

const DEFAULT_CONVERSION_SETTINGS: ConversionSettings = {
  targetFormat: 'mp4',
  videoCodec: 'h264',
  resolution: 'source',
  frameRate: 'source',
  videoBitrate: '1500',
  audioCodec: 'aac',
  sampleRate: '48000',
  channels: 'stereo',
  audioBitrate: '192',
};

const EMPTY_OUTPUT_POLICY: OutputPolicy = {
  directory: '',
  naming: 'preserve',
  existingFile: 'auto-rename',
  afterConversion: 'none',
};

const ANALYSIS_CONTENT_WIDTH = 800;

type AnalysisRowMode = string;

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function extensionOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() || '';
}

function toLibraryItem(file: AudioFile, existing?: LibraryItem): LibraryItem {
  return {
    id: file.id,
    name: file.name,
    path: file.path || existing?.path || '',
    size: file.size || file.file.size || existing?.size || 0,
    duration: file.duration || existing?.duration,
    extension: file.extension || extensionOf(file.name),
    status:
      file.status === FileStatus.COMPLETED
        ? 'analyzed'
        : file.status === FileStatus.ANALYZING
          ? 'analyzing'
          : file.status === FileStatus.ERROR
            ? 'error'
            : 'idle',
    segmentCount: file.segments.length,
    avgLatency: file.avgLatency || existing?.avgLatency,
    isFavorite: file.isFavorite ?? existing?.isFavorite ?? false,
    isDeleted: file.isDeleted ?? existing?.isDeleted ?? false,
    collectionIds: file.collectionIds ?? existing?.collectionIds ?? [],
    addedAt: file.addedAt || existing?.addedAt || Date.now(),
    updatedAt: Date.now(),
    lastAnalyzedAt: file.status === FileStatus.COMPLETED ? Date.now() : existing?.lastAnalyzedAt,
    error: file.error,
    segments: file.segments,
  };
}

function buildLatencyRows(file: AudioFile | null): LatencyRow[] {
  if (!file || file.status !== FileStatus.COMPLETED) return [];
  const sorted = [...file.segments].sort((a, b) => a.start - b.start);

  return sorted.slice(0, -1).map((segment, index) => {
    const next = sorted[index + 1];
    return {
      segment1End: segment.end,
      segment2Start: next.start,
      latency: next.start - segment.end,
      fileName: file.name,
      speakerFrom: segment.speaker,
      speakerTo: next.speaker,
      segment1Id: segment.id,
      segment2Id: next.id,
      segment1Index: index + 1,
      segment2Index: index + 2,
      remark: segment.remark || '',
    };
  });
}

function normalizeSpeakerKey(speaker: string): string {
  const match = speaker.match(/音色\s*(\d+)/);
  return match ? `音色${match[1]}` : speaker;
}

function directionKey(row: LatencyRow): string {
  return `${normalizeSpeakerKey(row.speakerFrom)}->${normalizeSpeakerKey(row.speakerTo)}`;
}

function filterLatencyRowsByMode(rows: LatencyRow[], mode: AnalysisRowMode): LatencyRow[] {
  if (mode === 'all') return rows;
  const matched = rows.filter(row => directionKey(row) === mode);
  return matched.length ? matched : rows;
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('analyzer');
  const [activeCategory, setActiveCategory] = useState<LibraryCategory>('all');
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [collections, setCollections] = useState<LibraryCollection[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLabOpen, setIsLabOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [editingSettingsFileId, setEditingSettingsFileId] = useState<string | null>(null);
  const [analysisRowMode, setAnalysisRowMode] = useState<AnalysisRowMode>('all');
  const [isAnalysisSidebarOverlaying, setIsAnalysisSidebarOverlaying] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [backendHealthy, setBackendHealthy] = useState<boolean>(true);
  const [outputPolicy, setOutputPolicy] = useState<OutputPolicy>(EMPTY_OUTPUT_POLICY);
  const [conversionSettings, setConversionSettings] = useState<ConversionSettings>(DEFAULT_CONVERSION_SETTINGS);
  const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const activeFile = files.find(f => f.id === selectedFileId) || null;

  const persistState = useCallback((
    nextLibrary: LibraryItem[],
    nextOutput = outputPolicy,
    nextConversion = conversionSettings,
    nextCollections = collections,
  ) => {
    if (!window.electron?.saveLibraryState) return;
    const state: PersistedAppState = {
      version: 1,
      library: nextLibrary,
      collections: nextCollections,
      outputPolicy: nextOutput,
      conversionSettings: nextConversion,
      activeCategory,
      activeCollectionId,
    };
    window.electron.saveLibraryState(state).catch(error => {
      console.error('Failed to persist library state', error);
    });
  }, [activeCategory, activeCollectionId, collections, conversionSettings, outputPolicy]);

  const upsertLibraryItem = useCallback((file: AudioFile) => {
    setLibraryItems(prev => {
      const existing = prev.find(item => item.id === file.id);
      const nextItem = toLibraryItem(file, existing);
      const next = existing
        ? prev.map(item => (item.id === file.id ? nextItem : item))
        : [nextItem, ...prev];
      persistState(next);
      return next;
    });
  }, [persistState]);

  useEffect(() => {
    const loadPersistedState = async () => {
      if (!window.electron?.loadLibraryState) return;
      const persisted = await window.electron.loadLibraryState() as PersistedAppState | null;
      const downloads = await window.electron.getDownloadsDirectory?.();
      const nextOutput = persisted?.outputPolicy || { ...EMPTY_OUTPUT_POLICY, directory: downloads || '' };
      setLibraryItems(persisted?.library || []);
      setCollections(persisted?.collections || []);
      setOutputPolicy(nextOutput);
      setConversionSettings(persisted?.conversionSettings || DEFAULT_CONVERSION_SETTINGS);
      setActiveCategory(persisted?.activeCategory || 'all');
      setActiveCollectionId(persisted?.activeCollectionId || null);
    };

    loadPersistedState().catch(error => console.error('Failed to load persisted state', error));
  }, []);

  useEffect(() => {
    persistState(libraryItems);
  }, [activeCategory, activeCollectionId, collections, libraryItems, persistState]);

  useEffect(() => {
    persistState(libraryItems, outputPolicy, conversionSettings);
  }, [conversionSettings, libraryItems, outputPolicy, persistState]);

  const checkHealth = useCallback(async () => {
    try {
      await checkBackendHealth(settings);
      setBackendHealthy(true);
    } catch {
      setBackendHealthy(false);
    }
  }, [settings]);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  const analyze = useCallback(async (file: AudioFile, config: AppSettings) => {
    setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: FileStatus.ANALYZING, error: undefined, updatedAt: Date.now() } : f));
    upsertLibraryItem({ ...file, status: FileStatus.ANALYZING, error: undefined });

    try {
      const segments = await analyzeAudio(file.file, config);
      setFiles(prev => prev.map(f => {
        if (f.id !== file.id) return f;
        const next = { ...f, status: FileStatus.COMPLETED, segments, lastAnalyzedAt: Date.now(), updatedAt: Date.now() };
        upsertLibraryItem(next);
        return next;
      }));
      setSelectedFileId(prev => prev || file.id);
    } catch (err: any) {
      const message = err.message || '分析失败';
      setFiles(prev => prev.map(f => {
        if (f.id !== file.id) return f;
        const next = { ...f, status: FileStatus.ERROR, error: message, updatedAt: Date.now() };
        upsertLibraryItem(next);
        return next;
      }));
    }
  }, [upsertLibraryItem]);

  const addFiles = useCallback((newFiles: AudioFile[], shouldAnalyze = true) => {
    if (newFiles.length === 0) return;
    setFiles(prev => {
      const existingIds = new Set(prev.map(file => file.id));
      return [...prev, ...newFiles.filter(file => !existingIds.has(file.id))];
    });
    newFiles.forEach(upsertLibraryItem);
    setSelectedFileId(newFiles[0].id);
    if (shouldAnalyze) {
      newFiles.forEach(file => analyze(file, file.settings || settings));
    }
  }, [analyze, settings, upsertLibraryItem]);

  const handleFileUpload = useCallback((fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const newFiles: AudioFile[] = Array.from(fileList).map(file => ({
      id: makeId('file'),
      file,
      name: file.name,
      blobUrl: URL.createObjectURL(file),
      status: FileStatus.IDLE,
      segments: [],
      size: file.size,
      extension: extensionOf(file.name),
      collectionIds: activeCollectionId ? [activeCollectionId] : [],
      addedAt: Date.now(),
      updatedAt: Date.now(),
    }));
    addFiles(newFiles);
  }, [activeCollectionId, addFiles]);

  const createAudioFileFromPath = useCallback(async (filePath: string, existing?: LibraryItem): Promise<AudioFile> => {
    if (!window.electron?.readFileAsBytes) {
      throw new Error('当前环境不支持读取本地文件路径，请在 Electron 应用中使用。');
    }
    const payload = await window.electron.readFileAsBytes(filePath);
    const bytes = new Uint8Array(payload.data);
    const file = new File([bytes], payload.name);
    return {
      id: existing?.id || makeId('file'),
      file,
      name: payload.name,
      blobUrl: URL.createObjectURL(file),
      status: existing?.segments?.length ? FileStatus.COMPLETED : FileStatus.IDLE,
      segments: existing?.segments || [],
      path: payload.path,
      size: payload.size,
      extension: payload.extension,
      isFavorite: existing?.isFavorite || false,
      isDeleted: existing?.isDeleted || false,
      collectionIds: existing?.collectionIds || (activeCollectionId ? [activeCollectionId] : []),
      addedAt: existing?.addedAt || Date.now(),
      updatedAt: Date.now(),
      lastAnalyzedAt: existing?.lastAnalyzedAt,
    };
  }, [activeCollectionId]);

  const handleBrowseFiles = useCallback(async () => {
    if (!window.electron?.selectAudioFiles) {
      document.getElementById('sidebar-file-upload')?.click();
      return;
    }

    const references = await window.electron.selectAudioFiles();
    const loaded = await Promise.all(references.map(ref => createAudioFileFromPath(ref.path)));
    addFiles(loaded);
  }, [addFiles, createAudioFileFromPath]);

  const handleSelectLibraryItem = useCallback(async (itemId: string) => {
    const alreadyLoaded = files.find(file => file.id === itemId);
    if (alreadyLoaded) {
      setSelectedFileId(itemId);
      return;
    }

    const item = libraryItems.find(entry => entry.id === itemId);
    if (!item?.path) return;

    try {
      const loaded = await createAudioFileFromPath(item.path, item);
      addFiles([loaded], !item.segments?.length);
      setSelectedFileId(loaded.id);
    } catch (error: any) {
      setLibraryItems(prev => prev.map(entry => entry.id === itemId ? { ...entry, status: 'error', error: error.message } : entry));
    }
  }, [addFiles, createAudioFileFromPath, files, libraryItems]);

  const retryFile = useCallback((fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (file) {
      analyze(file, file.settings || settings);
      return;
    }
    handleSelectLibraryItem(fileId);
  }, [analyze, files, handleSelectLibraryItem, settings]);

  const handleDeleteFile = useCallback((fileId: string) => {
    setConfirmConfig({
      isOpen: true,
      title: '移到回收站',
      message: '确定要将这个音频文件移到回收站吗？本地原文件不会被删除。',
      confirmText: '移到回收站',
      onConfirm: () => {
        setFiles(prev => prev.map(file => file.id === fileId ? { ...file, isDeleted: true } : file));
        setLibraryItems(prev => {
          const next = prev.map(item => item.id === fileId ? { ...item, isDeleted: true, status: 'deleted' as const, updatedAt: Date.now() } : item);
          persistState(next);
          return next;
        });
        setSelectedFileId(prev => prev === fileId ? null : prev);
      },
    });
  }, [persistState]);

  const handleRestoreFile = useCallback((fileId: string) => {
    setFiles(prev => prev.map(file => file.id === fileId ? { ...file, isDeleted: false, updatedAt: Date.now() } : file));
    setLibraryItems(prev => {
      const next = prev.map(item => item.id === fileId ? { ...item, isDeleted: false, status: 'idle' as const, updatedAt: Date.now() } : item);
      persistState(next);
      return next;
    });
  }, [persistState]);

  const handlePermanentDeleteFile = useCallback((fileId: string) => {
    setConfirmConfig({
      isOpen: true,
      title: '彻底删除记录',
      message: '确定要从应用文件库中彻底删除这条记录吗？本地原文件不会被删除。',
      confirmText: '彻底删除',
      onConfirm: () => {
        setFiles(prev => prev.filter(file => file.id !== fileId));
        setLibraryItems(prev => {
          const next = prev.filter(item => item.id !== fileId);
          persistState(next);
          return next;
        });
        setSelectedFileId(prev => prev === fileId ? null : prev);
      },
    });
  }, [persistState]);

  const handleCreateLibrary = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const nextCollection: LibraryCollection = {
      id: makeId('library'),
      name: trimmed,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setCollections(prev => {
      const next = [nextCollection, ...prev];
      persistState(libraryItems, outputPolicy, conversionSettings, next);
      return next;
    });
    setActiveCategory('all');
    setActiveCollectionId(nextCollection.id);
  }, [conversionSettings, libraryItems, outputPolicy, persistState]);

  const handleDeleteLibrary = useCallback((collectionId: string) => {
    const collection = collections.find(item => item.id === collectionId);
    if (!collection) return;

    setConfirmConfig({
      isOpen: true,
      title: '删除文件库',
      message: `确定要删除“${collection.name}”吗？删除文件库只会移除这个自定义库，不会删除库内文件或本地原文件。`,
      confirmText: '删除文件库',
      onConfirm: () => {
        const nextCollections = collections.filter(item => item.id !== collectionId);
        const nextLibrary = libraryItems.map(item => ({
          ...item,
          collectionIds: item.collectionIds.filter(id => id !== collectionId),
          updatedAt: item.collectionIds.includes(collectionId) ? Date.now() : item.updatedAt,
        }));

        setCollections(nextCollections);
        setLibraryItems(nextLibrary);
        setFiles(prev => prev.map(file => ({
          ...file,
          collectionIds: (file.collectionIds || []).filter(id => id !== collectionId),
          updatedAt: file.collectionIds?.includes(collectionId) ? Date.now() : file.updatedAt,
        })));
        if (activeCollectionId === collectionId) {
          setActiveCollectionId(null);
          setActiveCategory('all');
        }
        persistState(nextLibrary, outputPolicy, conversionSettings, nextCollections);
      },
    });
  }, [activeCollectionId, collections, conversionSettings, libraryItems, outputPolicy, persistState]);

  const handleMoveToLibrary = useCallback((fileId: string, collectionId: string | null) => {
    const nextIds = collectionId ? [collectionId] : [];
    setFiles(prev => prev.map(file => file.id === fileId ? { ...file, collectionIds: nextIds, updatedAt: Date.now() } : file));
    setLibraryItems(prev => {
      const next = prev.map(item => item.id === fileId ? { ...item, collectionIds: nextIds, updatedAt: Date.now() } : item);
      persistState(next);
      return next;
    });
  }, [persistState]);

  const handleToggleFavorite = useCallback((fileId: string) => {
    setFiles(prev => prev.map(file => file.id === fileId ? { ...file, isFavorite: !file.isFavorite } : file));
    setLibraryItems(prev => {
      const next = prev.map(item => item.id === fileId ? { ...item, isFavorite: !item.isFavorite, updatedAt: Date.now() } : item);
      persistState(next);
      return next;
    });
  }, [persistState]);

  const handleReanalyzeRequest = useCallback((fileId: string) => {
    const file = files.find(f => f.id === fileId);
    const hasCustomSettings = !!file?.settings;

    setConfirmConfig({
      isOpen: true,
      title: '重新分析',
      message: `确定要使用${hasCustomSettings ? '该文件的专属配置' : '全局默认配置'}重新分析此音频吗？现有的片段修改将会丢失。`,
      confirmText: '重新分析',
      onConfirm: () => retryFile(fileId),
    });
  }, [files, retryFile]);

  const handleSegmentUpdate = useCallback((fileId: string, segments: AudioSegment[]) => {
    setFiles(prev => prev.map(file => {
      if (file.id !== fileId) return file;
      const next = { ...file, segments, status: FileStatus.COMPLETED, updatedAt: Date.now() };
      upsertLibraryItem(next);
      return next;
    }));
  }, [upsertLibraryItem]);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileUpload(e.dataTransfer.files);
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (e.clipboardData?.files.length) {
        handleFileUpload(e.clipboardData.files);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handleFileUpload]);

  const selectedLatencyRows = useMemo(() => buildLatencyRows(activeFile), [activeFile]);
  const modeLatencyRows = useMemo(
    () => filterLatencyRowsByMode(selectedLatencyRows, analysisRowMode),
    [analysisRowMode, selectedLatencyRows],
  );

  const analysisStats = useMemo(() => {
    const latencies = modeLatencyRows.map(row => row.latency).filter(value => Number.isFinite(value));
    const positiveLatencies = latencies.filter(value => value > 0);
    const avg = latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : 0;
    const max = latencies.length ? Math.max(...latencies) : 0;
    const min = positiveLatencies.length ? Math.min(...positiveLatencies) : 0;
    return { segments: modeLatencyRows.length, avg, max, min };
  }, [modeLatencyRows]);

  const analysisStatCards = [
    { label: '片段数', value: analysisStats.segments, hint: '当前模式', icon: AudioWaveform, tone: 'blue' },
    { label: '平均时延', value: `${analysisStats.avg.toFixed(2)}s`, hint: '当前平均', icon: Clock3, tone: 'orange' },
    { label: '最高时延', value: `${analysisStats.max.toFixed(2)}s`, hint: '最大值', icon: TrendingUp, tone: 'purple' },
    { label: '最低时延', value: `${analysisStats.min.toFixed(2)}s`, hint: '最小值', icon: TrendingDown, tone: 'sky' },
  ];

  const statToneClass: Record<string, string> = {
    green: 'bg-emerald-50 text-[var(--psbc-green)] ring-emerald-100',
    blue: 'bg-blue-50 text-blue-600 ring-blue-100',
    orange: 'bg-orange-50 text-orange-600 ring-orange-100',
    purple: 'bg-violet-50 text-violet-600 ring-violet-100',
    sky: 'bg-sky-50 text-sky-600 ring-sky-100',
  };

  return (
    <div className="app-shell flex h-screen w-full bg-slate-50 text-slate-900">
      <AudioFileSidebar
        files={files}
        libraryItems={libraryItems}
        selectedFileId={selectedFileId}
        activeTab={activeTab}
        activeCategory={activeCategory}
        activeCollectionId={activeCollectionId}
        collections={collections}
        onChangeTab={setActiveTab}
        onChangeCategory={(category) => {
          setActiveCategory(category);
          setActiveCollectionId(null);
        }}
        onChangeCollection={(collectionId) => {
          setActiveCategory('all');
          setActiveCollectionId(collectionId);
        }}
        onSelectFile={setSelectedFileId}
        onSelectLibraryItem={handleSelectLibraryItem}
        onUpload={handleFileUpload}
        onBrowseFiles={handleBrowseFiles}
        onCreateLibrary={handleCreateLibrary}
        onDeleteLibrary={handleDeleteLibrary}
        onMoveToLibrary={handleMoveToLibrary}
        onRetry={retryFile}
        onReanalyze={handleReanalyzeRequest}
        onDelete={handleDeleteFile}
        onRestore={handleRestoreFile}
        onPermanentDelete={handlePermanentDeleteFile}
        onToggleFavorite={handleToggleFavorite}
        onOpenFileSettings={setEditingSettingsFileId}
        onOpenGlobalSettings={() => setIsSettingsOpen(true)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {!backendHealthy && (
          <div className="flex items-center justify-between border-b border-red-200 bg-red-50 px-5 py-2 text-sm text-red-700">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} />
              <span>内置音频分析服务未连接，请重试</span>
            </div>
            <button onClick={checkHealth} className="flex items-center gap-1 font-medium hover:underline">
              <RefreshCw size={14} /> 重试
            </button>
          </div>
        )}

        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          {activeTab === 'converter' ? (
            <ConverterPage
              onBack={() => setActiveTab('analyzer')}
              existingFiles={files}
              libraryItems={libraryItems}
              outputPolicy={outputPolicy}
              conversionSettings={conversionSettings}
              onOutputPolicyChange={(next) => {
                setOutputPolicy(next);
              }}
              onConversionSettingsChange={setConversionSettings}
            />
          ) : activeTab === 'splitter' ? (
            <SplitterPage onBack={() => setActiveTab('analyzer')} />
          ) : (
            <>
              <main
                className={`relative flex min-w-0 flex-1 flex-col gap-4 overflow-hidden bg-slate-50/70 p-5 transition-colors ${
                  isDragging ? 'bg-[var(--psbc-green-soft)]/60 ring-4 ring-[var(--psbc-green-line)]' : ''
                }`}
                style={isAnalysisSidebarOverlaying ? { width: ANALYSIS_CONTENT_WIDTH, flex: '0 0 auto' } : undefined}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
              >
                <div className="grid shrink-0 grid-cols-4 gap-2">
                  {analysisStatCards.map(({ label, value, hint, icon: Icon, tone }) => (
                    <div key={label} className="group relative min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-slate-300">
                      <div className="min-w-0 pr-8">
                        <div className="whitespace-nowrap text-[11px] font-bold leading-none text-slate-500">{label}</div>
                        <div className="mt-2 whitespace-nowrap text-[20px] font-bold leading-none text-slate-950">{value}</div>
                        <div className="mt-2 whitespace-nowrap text-[11px] font-medium leading-none text-slate-500">{hint}</div>
                      </div>
                      <div className={`absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg ring-1 ${statToneClass[tone]}`}>
                        <Icon size={15} />
                      </div>
                    </div>
                  ))}
                </div>

                {files.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-slate-400 shadow-inner">
                    <button
                      onClick={handleBrowseFiles}
                      className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-transform hover:scale-105"
                    >
                      <FileUploadIcon />
                    </button>
                    <h3 className="mb-2 text-lg font-semibold text-slate-700">拖拽音频文件到此处</h3>
                    <p className="max-w-md text-center text-sm leading-6">
                      支持 .mp3, .wav, .m4a, .mp4 等格式，也可以从左侧文件库添加。
                    </p>
                  </div>
                ) : (
                  <AnalysisTable
                    files={activeFile ? [activeFile] : []}
                    mode={analysisRowMode}
                    onModeChange={setAnalysisRowMode}
                    activeSegmentId={activeSegmentId}
                    onSegmentSelect={setActiveSegmentId}
                    speakerLabels={activeFile?.settings?.speakerLabels || settings.speakerLabels}
                  />
                )}

                {isDragging && (
                  <div className="absolute inset-4 z-50 flex items-center justify-center rounded-xl border-4 border-[var(--psbc-green)] bg-[var(--psbc-green-soft)]/80 backdrop-blur-sm">
                    <div className="rounded-xl bg-white px-8 py-4 text-lg font-bold text-[var(--psbc-green)] shadow-xl">
                      松开鼠标以上传
                    </div>
                  </div>
                )}
              </main>

              <WaveformSidebar
                file={activeFile}
                onUpdateSegments={handleSegmentUpdate}
                onClose={() => setSelectedFileId(null)}
                settings={activeFile?.settings || settings}
                activeSegmentId={activeSegmentId}
                onSegmentSelect={setActiveSegmentId}
                onReanalyze={handleReanalyzeRequest}
                onOpenSettings={setEditingSettingsFileId}
                onOverlayChange={setIsAnalysisSidebarOverlaying}
              />
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        config={confirmConfig}
        onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />

      <SettingsModal
        isOpen={isSettingsOpen || editingSettingsFileId !== null}
        title={editingSettingsFileId ? '文件专属配置' : '全局默认配置'}
        onClose={() => {
          setIsSettingsOpen(false);
          setEditingSettingsFileId(null);
        }}
        settings={
          editingSettingsFileId
            ? (files.find(f => f.id === editingSettingsFileId)?.settings || settings)
            : settings
        }
        onReset={editingSettingsFileId ? () => {
          setFiles(prev => prev.map(f => f.id === editingSettingsFileId ? { ...f, settings: undefined } : f));
        } : undefined}
        onSave={(newSettings) => {
          if (editingSettingsFileId) {
            setFiles(prev => prev.map(f => f.id === editingSettingsFileId ? { ...f, settings: newSettings } : f));
          } else {
            setSettings(newSettings);
            setTimeout(checkHealth, 100);
          }
        }}
      />

      <LabModal
        isOpen={isLabOpen}
        onClose={() => setIsLabOpen(false)}
        currentSegments={activeFile?.segments || []}
        audioFile={activeFile?.file || null}
        settings={activeFile?.settings || settings}
      />
    </div>
  );
};

const FileUploadIcon: React.FC = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 16V4" />
    <path d="m7 9 5-5 5 5" />
    <path d="M20 16.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2.5" />
  </svg>
);

export default App;
