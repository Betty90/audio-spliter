import React, { useState, useCallback } from 'react';
import { Upload, FileAudio, ArrowRight, Download, Loader2, AlertCircle, RefreshCw, Trash2, Plus, CheckCircle2, Archive } from 'lucide-react';
import { DEFAULT_SETTINGS } from '../constants';
import { AudioFile } from '../types';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

interface ConverterPageProps {
  onBack: () => void;
  existingFiles: AudioFile[];
}

interface QueueItem {
  id: string;
  file: File;
  status: 'idle' | 'converting' | 'success' | 'error';
  convertedUrl?: string;
  error?: string;
  progress?: number;
}

const ConverterPage: React.FC<ConverterPageProps> = ({ onBack, existingFiles }) => {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [targetFormat, setTargetFormat] = useState<string>('mp4');
  const [isConverting, setIsConverting] = useState(false);
  const [showExistingFiles, setShowExistingFiles] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles: QueueItem[] = Array.from(e.target.files).map((file: File) => ({
        id: `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        status: 'idle'
      }));
      setQueue(prev => [...prev, ...newFiles]);
    }
  };

  const handleAddExistingFile = (file: AudioFile) => {
    // Check if already in queue
    if (queue.some(q => q.file.name === file.file.name && q.file.size === file.file.size)) {
        return;
    }
    
    const newItem: QueueItem = {
        id: `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file: file.file,
        status: 'idle'
    };
    setQueue(prev => [...prev, newItem]);
    setShowExistingFiles(false);
  };

  const handleRemoveItem = (id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
  };

  const convertItem = async (item: QueueItem, format: string) => {
    // Update status to converting
    setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'converting', error: undefined } : q));

    const formData = new FormData();
    formData.append('file', item.file);
    formData.append('targetFormat', format);

    try {
      console.log(`Requesting conversion: ${DEFAULT_SETTINGS.backendUrl}/convert`);
      const response = await fetch(`${DEFAULT_SETTINGS.backendUrl}/convert`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || '转换失败');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      setQueue(prev => prev.map(q => 
        q.id === item.id ? { ...q, status: 'success', convertedUrl: url } : q
      ));
    } catch (err: any) {
      console.error('Conversion error:', err);
      setQueue(prev => prev.map(q => 
        q.id === item.id ? { ...q, status: 'error', error: err.message || '转换过程中发生错误' } : q
      ));
    }
  };

  const handleConvertAll = async () => {
    setIsConverting(true);
    
    // Process sequentially to avoid overwhelming the server/browser
    // Filter for items that are not already successful or converting
    const itemsToConvert = queue.filter(q => q.status === 'idle' || q.status === 'error');
    
    for (const item of itemsToConvert) {
        await convertItem(item, targetFormat);
    }
    
    setIsConverting(false);
  };

  const handleDownloadAll = async () => {
    const successfulItems = queue.filter(q => q.status === 'success' && q.convertedUrl);
    if (successfulItems.length === 0) return;

    if (successfulItems.length === 1) {
        // Single file download
        const item = successfulItems[0];
        const link = document.createElement('a');
        link.href = item.convertedUrl!;
        link.download = `converted_${item.file.name.split('.')[0]}.${targetFormat}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } else {
        // Batch zip download
        const zip = new JSZip();
        const folder = zip.folder("converted_audio");
        
        // Fetch blobs and add to zip
        const promises = successfulItems.map(async (item) => {
            const response = await fetch(item.convertedUrl!);
            const blob = await response.blob();
            const fileName = `converted_${item.file.name.split('.')[0]}.${targetFormat}`;
            folder?.file(fileName, blob);
        });

        await Promise.all(promises);
        
        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, "converted_files.zip");
    }
  };

  return (
    <div className="flex flex-col h-full p-4 lg:p-5 w-full overflow-hidden gap-4">
      <div className="flex justify-between items-center rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm gap-4">
        <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900 leading-tight">批量格式转换</h2>
            <p className="text-slate-500 text-sm">支持 MP4, M4A, WAV, MP3 批量处理与下载</p>
        </div>
        
        {/* Format Selection */}
        <div className="flex items-center gap-3 bg-slate-50 p-1.5 rounded-lg border border-slate-200 shrink-0">
            <span className="text-xs font-semibold text-slate-500 pl-2">目标</span>
            <div className="flex gap-1">
                {['mp4', 'm4a', 'wav', 'mp3'].map(fmt => (
                    <button
                        key={fmt}
                        onClick={() => setTargetFormat(fmt)}
                        className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-all
                            ${targetFormat === fmt 
                                ? 'bg-[var(--psbc-green)] text-white shadow-sm' 
                                : 'text-slate-600 hover:bg-slate-100'}`}
                    >
                        {fmt.toUpperCase()}
                    </button>
                ))}
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-4 flex-1 min-h-0">
        
        {/* Left Column: Input Sources */}
        <div className="flex flex-col gap-4 min-h-0">
            {/* Upload Box */}
            <label className="flex flex-col items-center justify-center h-36 border border-dashed border-slate-300 bg-white rounded-xl cursor-pointer hover:bg-slate-50 transition-colors relative group shadow-sm">
                <div className="flex flex-col items-center text-slate-700 group-hover:scale-105 transition-transform">
                    <Upload size={30} className="mb-2 text-slate-500" />
                    <span className="font-medium">点击上传新文件</span>
                    <span className="text-xs text-slate-400 mt-1">支持批量选择</span>
                </div>
                <input type="file" multiple className="hidden" onChange={handleFileChange} accept="audio/*,video/*" />
            </label>

            {/* Existing Files List */}
            {existingFiles.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden flex-1 min-h-0">
                    <div className="p-3 border-b border-slate-200 bg-slate-50/80 flex justify-between items-center">
                        <h3 className="font-semibold text-slate-800 flex items-center gap-2 text-sm">
                            <FileAudio size={18} />
                            已分析文件
                        </h3>
                        <span className="text-xs bg-slate-200 px-2 py-0.5 rounded-full text-slate-600">{existingFiles.length}</span>
                    </div>
                    <div className="overflow-y-auto p-2 space-y-1 flex-1">
                        {existingFiles.map(file => (
                            <button
                                key={file.id}
                                onClick={() => handleAddExistingFile(file)}
                                className="w-full text-left p-2.5 rounded-lg hover:bg-slate-50 flex items-center justify-between group transition-colors border border-transparent hover:border-slate-200"
                            >
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-white group-hover:text-[var(--psbc-green)] transition-colors">
                                        <FileAudio size={16} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-slate-700 truncate">{file.name}</div>
                                        <div className="text-xs text-slate-400">{(file.file.size / 1024 / 1024).toFixed(2)} MB</div>
                                    </div>
                                </div>
                                <Plus size={16} className="text-slate-300 group-hover:text-[var(--psbc-green)]" />
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>

        {/* Right Column: Queue & Actions */}
        <div className="flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-0">
            <div className="p-3 border-b border-slate-200 flex justify-between items-center bg-slate-50/80">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2 text-sm">
                    <RefreshCw size={18} className={isConverting ? "animate-spin text-[var(--psbc-green)]" : ""} />
                    转换队列 ({queue.length})
                </h3>
                <div className="flex gap-2">
                    {queue.length > 0 && (
                        <button 
                            onClick={() => setQueue([])}
                            className="text-xs text-slate-500 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                        >
                            清空列表
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
                {queue.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
                        <div className="w-14 h-14 rounded-xl bg-slate-50 flex items-center justify-center mb-4 border border-slate-100">
                            <ArrowRight size={24} className="text-slate-300" />
                        </div>
                        <p>请从左侧添加文件开始转换</p>
                    </div>
                ) : (
                    queue.map(item => (
                        <div key={item.id} className="flex items-center gap-4 p-3 rounded-lg border border-slate-100 bg-white hover:border-slate-300 hover:shadow-sm transition-all group">
                            <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center text-slate-500 shrink-0">
                                {item.status === 'converting' ? (
                                    <Loader2 size={20} className="animate-spin text-[var(--psbc-green)]" />
                                ) : item.status === 'success' ? (
                                    <CheckCircle2 size={20} className="text-green-500" />
                                ) : item.status === 'error' ? (
                                    <AlertCircle size={20} className="text-red-500" />
                                ) : (
                                    <FileAudio size={20} />
                                )}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start mb-1">
                                    <h4 className="font-medium text-slate-700 truncate pr-2" title={item.file.name}>{item.file.name}</h4>
                                    <span className="text-xs text-slate-400 shrink-0">{(item.file.size / 1024 / 1024).toFixed(2)} MB</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                    {item.status === 'idle' && <span className="text-slate-500">准备就绪</span>}
                                    {item.status === 'converting' && <span className="text-[var(--psbc-green)] font-medium animate-pulse">正在转换...</span>}
                                    {item.status === 'success' && <span className="text-green-600 font-medium">转换成功</span>}
                                    {item.status === 'error' && <span className="text-red-500 font-medium truncate max-w-[200px]">{item.error}</span>}
                                </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                {item.status === 'success' && item.convertedUrl && (
                                    <a 
                                        href={item.convertedUrl}
                                        download={`converted_${item.file.name.split('.')[0]}.${targetFormat}`}
                                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                        title="下载"
                                    >
                                        <Download size={18} />
                                    </a>
                                )}
                                <button 
                                    onClick={() => handleRemoveItem(item.id)}
                                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                    title="移除"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="p-3 border-t border-slate-200 bg-slate-50/80 flex justify-between items-center gap-4">
                <div className="text-sm text-slate-500">
                    {queue.filter(q => q.status === 'success').length} / {queue.length} 完成
                </div>
                <div className="flex gap-3">
                    {queue.some(q => q.status === 'success') && (
                        <button
                            onClick={handleDownloadAll}
                            className="tool-button"
                        >
                            <Archive size={18} />
                            批量下载
                        </button>
                    )}
                    <button
                        onClick={handleConvertAll}
                        disabled={isConverting || queue.length === 0 || queue.every(q => q.status === 'success')}
                        className="flex items-center gap-2 px-5 py-2 bg-[var(--psbc-green)] text-white rounded-lg shadow-sm hover:bg-[var(--psbc-green-dark)] disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
                    >
                        {isConverting ? (
                            <>
                                <Loader2 size={18} className="animate-spin" />
                                转换中...
                            </>
                        ) : (
                            <>
                                <RefreshCw size={18} />
                                开始转换
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ConverterPage;
