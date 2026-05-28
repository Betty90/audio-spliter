import React, { useState, useEffect, useCallback } from 'react';
import { Upload, Music4, AlertCircle, RefreshCw, Layers, Repeat, Scissors, Keyboard } from 'lucide-react';
import { AudioFile, FileStatus, AudioSegment, AppSettings } from './types';
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

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'analyzer' | 'converter' | 'splitter'>('analyzer');
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLabOpen, setIsLabOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [editingSettingsFileId, setEditingSettingsFileId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [backendHealthy, setBackendHealthy] = useState<boolean>(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  // --- Health Check ---
  const checkHealth = useCallback(async () => {
    try {
      await checkBackendHealth(settings);
      setBackendHealthy(true);
    } catch (e) {
      setBackendHealthy(false);
    }
  }, [settings]);

  useEffect(() => {
    checkHealth();
    // Poll every 30 seconds or when settings change
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  // --- File Handling ---

  const analyze = async (file: AudioFile, config: AppSettings) => {
      // Set status to ANALYZING
      setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: FileStatus.ANALYZING, error: undefined } : f));

      try {
        const segments = await analyzeAudio(file.file, config);
        setFiles(prev => prev.map(f => 
            f.id === file.id 
                ? { ...f, status: FileStatus.COMPLETED, segments } 
                : f
        ));
        // If no file is selected, select this one (optional UX)
        setSelectedFileId(prev => prev ? prev : file.id);
      } catch (err: any) {
        console.error("Analysis failed", err);
        setFiles(prev => prev.map(f => 
            f.id === file.id 
                ? { ...f, status: FileStatus.ERROR, error: err.message || '分析失败' } 
                : f
        ));
      }
  };

  const handleFileUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    // Create file objects
    const newFiles: AudioFile[] = Array.from(fileList).map(file => ({
      id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      name: file.name,
      blobUrl: URL.createObjectURL(file),
      status: FileStatus.IDLE,
      segments: [],
    }));

    // Add to state and select the first new file
    setFiles(prev => [...prev, ...newFiles]);
    setSelectedFileId(newFiles[0].id);

    // Trigger analysis immediately
    newFiles.forEach(f => analyze(f, f.settings || settings));
  };

  const retryFile = (fileId: string) => {
      const file = files.find(f => f.id === fileId);
      if (file) {
          analyze(file, file.settings || settings);
      }
  };

  const handleDeleteFile = (fileId: string) => {
    setConfirmConfig({
      isOpen: true,
      title: '确认删除',
      message: '确定要删除这个音频文件及其分析结果吗？',
      confirmText: '删除',
      onConfirm: () => {
        setFiles(prev => {
          const deletedIndex = prev.findIndex(f => f.id === fileId);
          const remainingFiles = prev.filter(f => f.id !== fileId);
          const nextFile = remainingFiles[Math.min(deletedIndex, remainingFiles.length - 1)] || null;

          setSelectedFileId(prevSelected => (
            prevSelected === fileId ? nextFile?.id || null : prevSelected
          ));

          return remainingFiles;
        });
      }
    });
  };

  const handleReanalyzeRequest = (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    const hasCustomSettings = !!file?.settings;
    
    setConfirmConfig({
      isOpen: true,
      title: '重新分析',
      message: `确定要使用${hasCustomSettings ? '该文件的专属配置' : '全局默认配置'}重新分析此音频吗？现有的片段修改将会丢失。`,
      confirmText: '重新分析',
      onConfirm: () => {
        retryFile(fileId);
      }
    });
  };

  // --- Drag & Drop & Paste ---

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
  }, [files, settings]); 

  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);

  // ... existing code ...

  const handleSegmentUpdate = useCallback((fileId: string, segments: AudioSegment[]) => {
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, segments } : f));
  }, []);

  // --- Render ---

  const activeFile = files.find(f => f.id === selectedFileId) || null;

  return (
    <div className="app-shell flex h-screen w-full flex-col bg-slate-100 text-slate-900">
      
      {/* Header */}
      <header className="h-14 bg-white/95 border-b border-slate-200 flex items-center justify-between px-4 lg:px-5 shadow-sm z-20 backdrop-blur">
        <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative bg-[var(--psbc-green)] p-2 rounded-lg shadow-sm">
                <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[var(--psbc-gold)] ring-2 ring-white" />
                <Music4 className="text-white" size={20} />
            </div>
            <div className="hidden md:block min-w-0">
                <h1 className="text-[15px] font-bold text-slate-900 tracking-tight leading-tight">UAudioLab</h1>
                <p className="text-[11px] text-slate-500 leading-tight">离线音频工作台</p>
            </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
                onClick={() => setActiveTab('analyzer')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'analyzer' ? 'bg-white text-[var(--psbc-green)] shadow-sm ring-1 ring-[var(--psbc-green-line)]' : 'text-slate-500 hover:text-slate-700'}`}
            >
                <Layers size={16} />
                分析
            </button>
            <button
                onClick={() => setActiveTab('splitter')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'splitter' ? 'bg-white text-[var(--psbc-green)] shadow-sm ring-1 ring-[var(--psbc-green-line)]' : 'text-slate-500 hover:text-slate-700'}`}
            >
                <Scissors size={16} />
                分割
            </button>
            <button
                onClick={() => setActiveTab('converter')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'converter' ? 'bg-white text-[var(--psbc-green)] shadow-sm ring-1 ring-[var(--psbc-green-line)]' : 'text-slate-500 hover:text-slate-700'}`}
            >
                <Repeat size={16} />
                转换
            </button>
        </div>

        <div className="flex items-center gap-2">
            <div className="hidden lg:flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-500">
                <Keyboard size={13} />
                <kbd className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-600 shadow-sm">Cmd/Ctrl+V</kbd>
            </div>
        </div>
      </header>
      
      {/* Health Warning Banner */}
      {!backendHealthy && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-2 flex items-center justify-between text-sm text-red-700">
            <div className="flex items-center gap-2">
                <AlertCircle size={16} />
                <span>内置音频分析服务未连接，请重试</span>
            </div>
            <button onClick={checkHealth} className="flex items-center gap-1 hover:underline font-medium">
                <RefreshCw size={14} /> 重试
            </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden relative min-h-0">
        
        {activeTab === 'converter' ? (
            <ConverterPage 
                onBack={() => setActiveTab('analyzer')} 
                existingFiles={files}
            />
        ) : activeTab === 'splitter' ? (
            <SplitterPage 
                onBack={() => setActiveTab('analyzer')}
            />
        ) : (
            <>
                {/* Left Sidebar - Audio File List */}
                <AudioFileSidebar
                    files={files}
                    selectedFileId={selectedFileId}
                    isCollapsed={isSidebarCollapsed}
                    onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                    onSelectFile={setSelectedFileId}
                    onUpload={handleFileUpload}
                    onRetry={retryFile}
                    onReanalyze={handleReanalyzeRequest}
                    onDelete={handleDeleteFile}
                    onOpenFileSettings={setEditingSettingsFileId}
                    onOpenGlobalSettings={() => setIsSettingsOpen(true)}
                    onOpenLab={() => setIsLabOpen(true)}
                />

                {/* Main Content Area */}
                <main
                    className={`flex-1 flex flex-col gap-4 p-4 lg:p-5 overflow-hidden relative transition-all duration-300 min-w-0 ${isDragging ? 'bg-[var(--psbc-green-soft)]/50 ring-4 ring-[var(--psbc-green-line)] inset-0' : ''}`}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                >
                    {/* Empty State */}
                    {files.length === 0 && (
                        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-slate-300 rounded-2xl bg-white/70 text-slate-400 shadow-inner">
                            <div className="mb-4 rounded-2xl bg-slate-100 p-5">
                                <Upload size={44} className="text-slate-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-700 mb-2">拖拽音频文件到此处</h3>
                            <p className="max-w-md text-center text-sm leading-6">
                                支持 .mp3, .wav, .m4a, .mp4 等格式<br/>
                                或通过左侧栏上传按钮添加文件
                            </p>
                        </div>
                    )}

                    {/* Analysis Table */}
                    {files.length > 0 && (
                        <AnalysisTable
                            files={files}
                            activeSegmentId={activeSegmentId}
                            onSegmentSelect={setActiveSegmentId}
                        />
                    )}

                    {/* Drag Overlay */}
                    {isDragging && (
                        <div className="absolute inset-0 bg-[var(--psbc-green-soft)]/80 backdrop-blur-sm z-50 flex items-center justify-center border-4 border-[var(--psbc-green)] rounded-lg m-4">
                            <div className="bg-white px-8 py-4 rounded-xl shadow-xl text-[var(--psbc-green)] font-bold text-lg animate-bounce">
                                松开鼠标以上传
                            </div>
                        </div>
                    )}
                </main>

                {/* Right Sidebar - Waveform Player */}
                {selectedFileId && (
                    <WaveformSidebar
                        file={activeFile}
                        onUpdateSegments={handleSegmentUpdate}
                        onClose={() => setSelectedFileId(null)}
                        activeSegmentId={activeSegmentId}
                        onSegmentSelect={setActiveSegmentId}
                        onReanalyze={handleReanalyzeRequest}
                        onOpenSettings={setEditingSettingsFileId}
                    />
                )}
            </>
        )}
      </div>

      <ConfirmDialog 
        config={confirmConfig} 
        onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))} 
      />

      <SettingsModal 
        isOpen={isSettingsOpen || editingSettingsFileId !== null} 
        title={editingSettingsFileId ? "文件专属配置" : "全局默认配置"}
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
                // Re-check health when global settings change
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

export default App;
