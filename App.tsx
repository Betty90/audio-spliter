import React, { useState, useEffect, useCallback } from 'react';
import { Upload, FileAudio, Settings as SettingsIcon, Loader2, Music4, AlertCircle, Link as LinkIcon, RefreshCw, Layers, Repeat, Trash2, Activity, Scissors, Keyboard } from 'lucide-react';
import { AudioFile, FileStatus, AudioSegment, AppSettings } from './types';
import { analyzeAudio, checkHealth as checkBackendHealth } from './services/apiService';
import { DEFAULT_SETTINGS, ACCEPTED_MIME_TYPES } from './constants';
import SettingsModal from './components/SettingsModal';
import LabModal from './components/LabModal';
import WaveformSidebar from './components/WaveformSidebar';
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
  const backendLabel = settings.backendUrl && settings.backendUrl !== '/api'
    ? settings.backendUrl
    : 'Electron 自动后端';
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
    if (!fileList) return;

    // Create file objects
    const newFiles: AudioFile[] = Array.from(fileList).map(file => ({
      id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      name: file.name,
      blobUrl: URL.createObjectURL(file),
      status: FileStatus.IDLE,
      segments: [],
    }));

    // Add to state
    setFiles(prev => [...prev, ...newFiles]);

    // Trigger analysis immediately
    newFiles.forEach(f => analyze(f, f.settings || settings));
  };

  const retryFile = (fileId: string) => {
      const file = files.find(f => f.id === fileId);
      if (file) {
          analyze(file, file.settings || settings);
      }
  };

  const handleDeleteFile = (e: React.MouseEvent, fileId: string) => {
    e.stopPropagation(); // Prevent selecting the file when clicking delete
    setConfirmConfig({
      isOpen: true,
      title: '确认删除',
      message: '确定要删除这个音频文件及其分析结果吗？',
      confirmText: '删除',
      onConfirm: () => {
        setFiles(prev => prev.filter(f => f.id !== fileId));
        if (selectedFileId === fileId) {
          setSelectedFileId(null);
        }
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
                <h1 className="text-[15px] font-bold text-slate-900 tracking-tight leading-tight">AudioSlicer Pro</h1>
                <p className="text-[11px] text-slate-500 leading-tight">离线音频切片工作台</p>
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
            <button 
                onClick={() => setIsLabOpen(true)}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
                title="算法验证实验室"
            >
                <Activity size={20} />
            </button>
            <button 
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
                title="设置"
            >
                <SettingsIcon size={20} />
            </button>
        </div>
      </header>
      
      {/* Health Warning Banner */}
      {!backendHealthy && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-2 flex items-center justify-between text-sm text-red-700">
            <div className="flex items-center gap-2">
                <AlertCircle size={16} />
                <span>无法连接到后端服务（{backendLabel}）。请确认 Electron 内置后端已启动，或在设置中填写可访问的后端地址。</span>
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
                {/* Main Content Area */}
                <main 
                    className={`flex-1 flex flex-col gap-4 p-4 lg:p-5 overflow-hidden relative transition-all duration-300 min-w-0 ${isDragging ? 'bg-[var(--psbc-green-soft)]/50 ring-4 ring-[var(--psbc-green-line)] inset-0' : ''}`}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                >
                    {/* Toolbar / Upload Area */}
                    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm min-h-[72px]">
                        <button 
                            onClick={() => document.getElementById('file-upload')?.click()}
                            className="flex shrink-0 items-center gap-2 px-4 py-2.5 bg-[var(--psbc-green)] hover:bg-[var(--psbc-green-dark)] text-white rounded-lg shadow-sm cursor-pointer transition-transform active:scale-95 font-medium text-sm"
                        >
                            <Upload size={18} />
                            上传音频文件
                            <input 
                                id="file-upload"
                                type="file" 
                                multiple 
                                accept={Object.values(ACCEPTED_MIME_TYPES).flat().join(',')}
                                className="hidden"
                                onChange={(e) => handleFileUpload(e.target.files)}
                            />
                        </button>
                        
                        {/* Placeholder for URL input */}
                        <div className="relative group hidden xl:block">
                            <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50 px-3 py-2.5 w-60 focus-within:ring-2 focus-within:ring-[var(--psbc-green-line)] focus-within:border-[var(--psbc-green)] transition-all">
                                <LinkIcon size={16} className="text-gray-400 mr-2" />
                                <input 
                                    type="text" 
                                    placeholder="输入音频 URL (开发中)" 
                                    disabled
                                    className="bg-transparent border-none outline-none text-sm w-full text-gray-600 cursor-not-allowed" 
                                />
                            </div>
                        </div>
                        
                        {files.length > 0 && (
                             <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-1 px-1">
                                {files.map(file => (
                                    <button
                                        key={file.id}
                                        onClick={() => setSelectedFileId(file.id)}
                                        title={file.error || file.name}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border whitespace-nowrap transition-all group shrink-0
                                            ${selectedFileId === file.id 
                                                ? 'bg-[var(--psbc-green)] border-[var(--psbc-green)] text-white shadow-sm' 
                                                : file.status === FileStatus.ERROR 
                                                    ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
                                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                    >
                                        {file.status === FileStatus.ANALYZING ? (
                                            <Loader2 size={14} className="animate-spin text-[var(--psbc-green)]" />
                                        ) : file.status === FileStatus.ERROR ? (
                                            <AlertCircle size={14} className="text-red-500" />
                                        ) : (
                                            <FileAudio size={14} />
                                        )}
                                        <span className="truncate max-w-[100px]">{file.name}</span>
                                        
                                        {file.status === FileStatus.COMPLETED && (
                                            <div 
                                                onClick={(e) => { e.stopPropagation(); handleReanalyzeRequest(file.id); }}
                                                className={`ml-1 p-1 rounded-full hover:bg-black/10 transition-all ${selectedFileId === file.id ? 'text-white/70 hover:text-white' : 'text-slate-300 hover:text-[var(--psbc-green)]'}`}
                                                title="重新分析"
                                            >
                                                <RefreshCw size={12} />
                                            </div>
                                        )}

                                        <div 
                                            onClick={(e) => handleDeleteFile(e, file.id)}
                                            className={`ml-1 p-1 rounded-full hover:bg-black/10 transition-all ${selectedFileId === file.id ? 'text-white/70 hover:text-red-200' : 'text-slate-300 hover:text-red-500'}`}
                                            title="删除文件"
                                        >
                                            <Trash2 size={12} />
                                        </div>
                                    </button>
                                ))}
                             </div>
                        )}
                    </div>

                    {/* Empty State */}
                    {files.length === 0 && (
                        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-slate-300 rounded-2xl bg-white/70 text-slate-400 shadow-inner">
                            <div className="mb-4 rounded-2xl bg-slate-100 p-5">
                                <Upload size={44} className="text-slate-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-700 mb-2">拖拽音频文件到此处</h3>
                            <p className="max-w-md text-center text-sm leading-6">
                                支持 .mp3, .wav, .m4a, .mp4 等格式<br/>
                                Electron 会自动启动内置 Python 后端
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

                    {/* Error State Display - Removed or moved to sidebar/toast if needed, but for now relying on list status */}
                    {/* {activeFile?.status === FileStatus.ERROR && ( ... )} */}
                    
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
