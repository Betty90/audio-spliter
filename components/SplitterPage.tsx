import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, FileAudio, Play, Pause, Square, ZoomIn, ZoomOut, Scissors, Download, ArrowLeft, Repeat, X } from 'lucide-react';
import { ACCEPTED_MIME_TYPES } from '../constants';
import { exportSegmentWithOptions } from '../services/apiService';

interface SplitterPageProps {
  onBack: () => void;
}

interface AudioRegion {
  id: string;
  start: number;
  end: number;
  color: string;
}

type DragState = 
  | { type: 'none' }
  | { type: 'move'; regionId: string; offsetX: number }
  | { type: 'resize-left'; regionId: string }
  | { type: 'resize-right'; regionId: string };

const SplitterPage: React.FC<SplitterPageProps> = ({ onBack }) => {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  const [zoom, setZoom] = useState(100);
  const MIN_ZOOM = 10;
  const MAX_ZOOM = 1000;
  
  const [regions, setRegions] = useState<AudioRegion[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [isLooping, setIsLooping] = useState(false);
  const [dragState, setDragState] = useState<DragState>({ type: 'none' });
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportChannelOption, setExportChannelOption] = useState<'both' | 'left' | 'right'>('both');
  const [isExporting, setIsExporting] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveformContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [channelData, setChannelData] = useState<Float32Array[]>([]);

  // Handle file upload
  const handleFileUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    
    const file = fileList[0];
    setAudioFile(file);
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    setIsLoading(true);
    
    // Load audio data for waveform
    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const buffer = await audioContext.decodeAudioData(arrayBuffer);
      setAudioBuffer(buffer);
      
      // Extract channel data
      const channels: Float32Array[] = [];
      for (let i = 0; i < buffer.numberOfChannels; i++) {
        channels.push(buffer.getChannelData(i));
      }
      setChannelData(channels);
      setDuration(buffer.duration);
    } catch (err) {
      console.error('Failed to load audio:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Playback controls
  const togglePlayback = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const stopPlayback = () => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setIsPlaying(false);
    setCurrentTime(0);
  };

  // Zoom controls
  const zoomIn = () => setZoom(prev => Math.min(prev * 1.5, MAX_ZOOM));
  const zoomOut = () => setZoom(prev => Math.max(prev / 1.5, MIN_ZOOM));

  // Add new region
  const addRegion = () => {
    const newRegion: AudioRegion = {
      id: `region-${Date.now()}`,
      start: currentTime,
      end: Math.min(currentTime + 5, duration),
      color: `hsl(${Math.random() * 360}, 70%, 60%)`
    };
    setRegions(prev => [...prev, newRegion]);
    setSelectedRegionId(newRegion.id);
  };

  const deleteSelectedRegion = () => {
    if (!selectedRegionId) return;
    setRegions(prev => prev.filter(r => r.id !== selectedRegionId));
    setSelectedRegionId(null);
  };

  const openExportModal = () => {
    if (!selectedRegionId) return;
    setIsExportModalOpen(true);
  };

  const closeExportModal = () => {
    setIsExportModalOpen(false);
    setExportChannelOption('both');
  };

  const exportRegion = async () => {
    if (!selectedRegionId || !audioFile || !audioBuffer) return;
    
    const region = regions.find(r => r.id === selectedRegionId);
    if (!region) return;
    
    setIsExporting(true);
    
    try {
      const extension = audioFile.name.split('.').pop() || 'wav';
      const outputFilename = `segment_${regions.indexOf(region) + 1}_${formatTime(region.start).replace(/:/g, '-')}.${extension}`;
      
      const blob = await exportSegmentWithOptions(
        audioFile,
        region.start,
        region.end,
        outputFilename,
        {
          channels: exportChannelOption,
          preserveFormat: true
        }
      );
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = outputFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      closeExportModal();
    } catch (error) {
      console.error('Export failed:', error);
      alert('导出失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setIsExporting(false);
    }
  };

  const playRegion = (regionId: string) => {
    const region = regions.find(r => r.id === regionId);
    if (!region || !audioRef.current) return;
    
    audioRef.current.currentTime = region.start;
    audioRef.current.play();
    setIsPlaying(true);
    setIsLooping(true);
    setSelectedRegionId(regionId);
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || regions.length === 0) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = x / zoom;
    
    const HANDLE_WIDTH = 6;
    
    for (const region of regions) {
      const x1 = region.start * zoom;
      const x2 = region.end * zoom;
      
      if (Math.abs(x - x1) <= HANDLE_WIDTH) {
        setDragState({ type: 'resize-left', regionId: region.id });
        setSelectedRegionId(region.id);
        return;
      }
      
      if (Math.abs(x - x2) <= HANDLE_WIDTH) {
        setDragState({ type: 'resize-right', regionId: region.id });
        setSelectedRegionId(region.id);
        return;
      }
      
      if (x >= x1 && x <= x2) {
        setDragState({ type: 'move', regionId: region.id, offsetX: x - x1 });
        setSelectedRegionId(region.id);
        return;
      }
    }
    
    setSelectedRegionId(null);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragState.type === 'none' || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = Math.max(0, Math.min(x / zoom, duration));
    
    setRegions(prev => prev.map(region => {
      if (region.id !== dragState.regionId) return region;
      
      if (dragState.type === 'resize-left') {
        return { ...region, start: Math.min(time, region.end - 0.1) };
      } else if (dragState.type === 'resize-right') {
        return { ...region, end: Math.max(time, region.start + 0.1) };
      } else if (dragState.type === 'move') {
        const regionWidth = region.end - region.start;
        const newStart = Math.max(0, Math.min(time - dragState.offsetX / zoom, duration - regionWidth));
        return { ...region, start: newStart, end: newStart + regionWidth };
      }
      
      return region;
    }));
  };

  const handleCanvasMouseUp = () => {
    setDragState({ type: 'none' });
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragState.type !== 'none') return;
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const time = x / zoom;
    
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, Math.min(time, duration));
      setCurrentTime(audioRef.current.currentTime);
    }
  };
  useEffect(() => {
    const updateTime = () => {
      if (audioRef.current) {
        setCurrentTime(audioRef.current.currentTime);
        
        // Handle looping
        if (isLooping && selectedRegionId) {
          const region = regions.find(r => r.id === selectedRegionId);
          if (region) {
            if (audioRef.current.currentTime >= region.end) {
              audioRef.current.currentTime = region.start;
            }
          }
        }
      }
      animationRef.current = requestAnimationFrame(updateTime);
    };
    
    animationRef.current = requestAnimationFrame(updateTime);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, isLooping, selectedRegionId, regions]);

  // Draw waveform
  useEffect(() => {
    if (!canvasRef.current || channelData.length === 0) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas size
    const width = duration * zoom;
    const height = 300;
    canvas.width = width;
    canvas.height = height;
    
    // Clear canvas
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, height);
    
    // Draw channels
    const channelHeight = height / channelData.length;
    
    channelData.forEach((data, channelIndex) => {
      const yOffset = channelIndex * channelHeight;
      const centerY = yOffset + channelHeight / 2;
      
      ctx.beginPath();
      ctx.strokeStyle = channelIndex === 0 ? '#3b82f6' : '#10b981';
      ctx.lineWidth = 1;
      
      const samplesPerPixel = Math.ceil(data.length / width);
      
      for (let x = 0; x < width; x++) {
        const startSample = Math.floor(x * samplesPerPixel);
        const endSample = Math.min(startSample + samplesPerPixel, data.length);
        
        let min = 0;
        let max = 0;
        
        for (let i = startSample; i < endSample; i++) {
          const sample = data[i];
          if (sample < min) min = sample;
          if (sample > max) max = sample;
        }
        
        const y1 = centerY + min * (channelHeight / 2 - 2);
        const y2 = centerY + max * (channelHeight / 2 - 2);
        
        ctx.moveTo(x, y1);
        ctx.lineTo(x, y2);
      }
      
      ctx.stroke();
      
      // Draw channel label
      ctx.fillStyle = '#64748b';
      ctx.font = '12px sans-serif';
      ctx.fillText(channelIndex === 0 ? 'L' : 'R', 5, yOffset + 15);
    });
    
    // Draw regions
    regions.forEach(region => {
      const x1 = region.start * zoom;
      const x2 = region.end * zoom;
      const regionWidth = x2 - x1;
      
      ctx.fillStyle = region.color + '40'; // Add transparency
      ctx.fillRect(x1, 0, regionWidth, height);
      
      ctx.strokeStyle = region.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x1, 0, regionWidth, height);
      
      // Draw handles
      ctx.fillStyle = region.color;
      ctx.fillRect(x1 - 3, 0, 6, height);
      ctx.fillRect(x2 - 3, 0, 6, height);
    });
    
    // Draw playhead
    const playheadX = currentTime * zoom;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
    
  }, [channelData, duration, zoom, regions, currentTime]);

  // Format time
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 100);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft size={18} />
            <span>返回</span>
          </button>
          <h2 className="text-lg font-semibold text-slate-800">音频分割</h2>
        </div>
        
        <div className="flex items-center gap-2">
          {!audioFile ? (
            <button
              onClick={() => document.getElementById('splitter-file-upload')?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              <Upload size={16} />
              上传音频
              <input
                id="splitter-file-upload"
                type="file"
                accept={Object.values(ACCEPTED_MIME_TYPES).flat().join(',')}
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files)}
              />
            </button>
          ) : (
            <>
              <button
                onClick={() => document.getElementById('splitter-file-upload')?.click()}
                className="flex items-center gap-2 px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <FileAudio size={16} />
                更换文件
              </button>
              <input
                id="splitter-file-upload"
                type="file"
                accept={Object.values(ACCEPTED_MIME_TYPES).flat().join(',')}
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files)}
              />
            </>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!audioFile ? (
          // Empty state
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="w-32 h-32 bg-slate-100 rounded-full flex items-center justify-center mb-6">
              <Scissors size={48} className="text-slate-400" />
            </div>
            <h3 className="text-xl font-semibold text-slate-700 mb-2">上传音频文件开始分割</h3>
            <p className="text-slate-500 text-center max-w-md mb-6">
              支持 MP3、WAV、M4A 等格式<br />
              上传后可进行可视化波形编辑和片段导出
            </p>
            <button
              onClick={() => document.getElementById('splitter-file-upload')?.click()}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
            >
              <Upload size={18} />
              选择音频文件
            </button>
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4">
              <div className="flex items-center gap-2">
                {/* Playback controls */}
                <button
                  onClick={togglePlayback}
                  className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                </button>
                <button
                  onClick={stopPlayback}
                  className="p-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors"
                >
                  <Square size={18} />
                </button>
                <button
                  onClick={() => setIsLooping(!isLooping)}
                  className={`p-2 rounded-lg transition-colors ${isLooping ? 'bg-blue-100 text-blue-600' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
                  title={isLooping ? '循环播放开启' : '循环播放关闭'}
                >
                  <Repeat size={18} />
                </button>

                <div className="w-px h-8 bg-slate-200 mx-2" />

                <div className="text-sm font-mono text-slate-600">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={addRegion}
                  className="flex items-center gap-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <Scissors size={14} />
                  添加片段
                </button>
                {selectedRegionId && (
                  <>
                    <button
                      onClick={() => playRegion(selectedRegionId)}
                      className="p-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors"
                      title="播放片段"
                    >
                      <Play size={16} />
                    </button>
                    <button
                      onClick={deleteSelectedRegion}
                      className="px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium transition-colors"
                    >
                      删除
                    </button>
                    <button
                      onClick={openExportModal}
                      className="flex items-center gap-1 px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-sm font-medium transition-colors"
                    >
                      <Download size={14} />
                      导出
                    </button>
                  </>
                )}
                
                <div className="w-px h-8 bg-slate-200 mx-2" />
                
                {/* Zoom controls */}
                <button
                  onClick={zoomOut}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                  title="缩小"
                >
                  <ZoomOut size={18} className="text-slate-600" />
                </button>
                <span className="text-xs text-slate-500 w-16 text-center">
                  {zoom.toFixed(0)} px/s
                </span>
                <button
                  onClick={zoomIn}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                  title="放大"
                >
                  <ZoomIn size={18} className="text-slate-600" />
                </button>
              </div>
            </div>
            
            {/* Waveform display */}
            <div className="flex-1 overflow-auto bg-slate-100 p-4">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-slate-500">加载音频中...</div>
                </div>
              ) : (
                <div
                  ref={waveformContainerRef}
                  className="bg-white rounded-lg shadow-sm overflow-hidden"
                  style={{ minWidth: duration * zoom + 40 }}
                >
                  <canvas
                    ref={canvasRef}
                    className="block cursor-crosshair"
                    style={{ width: duration * zoom, height: 300 }}
                    onMouseDown={handleCanvasMouseDown}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseUp={handleCanvasMouseUp}
                    onMouseLeave={handleCanvasMouseUp}
                    onClick={handleCanvasClick}
                  />
                </div>
              )}
            </div>
            
            {/* Regions list */}
            {regions.length > 0 && (
              <div className="h-48 bg-white border-t border-slate-200 overflow-auto">
                <div className="p-4">
                  <h4 className="text-sm font-semibold text-slate-700 mb-3">片段列表</h4>
                  <div className="space-y-2">
                    {regions.map(region => (
                      <div
                        key={region.id}
                        onClick={() => setSelectedRegionId(region.id)}
                        className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                          selectedRegionId === region.id
                            ? 'bg-blue-50 border border-blue-200'
                            : 'bg-slate-50 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-4 h-4 rounded"
                            style={{ backgroundColor: region.color }}
                          />
                          <span className="text-sm font-medium text-slate-700">
                            片段 {regions.indexOf(region) + 1}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-slate-500">
                          <span>{formatTime(region.start)} - {formatTime(region.end)}</span>
                          <span className="font-mono">({formatTime(region.end - region.start)})</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      
      {/* Hidden audio element */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={() => setIsPlaying(false)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        />
      )}

      {isExportModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-96 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">导出片段</h3>
              <button
                onClick={closeExportModal}
                className="p-1 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  声道选择
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                    <input
                      type="radio"
                      name="channel"
                      value="both"
                      checked={exportChannelOption === 'both'}
                      onChange={(e) => setExportChannelOption(e.target.value as 'both' | 'left' | 'right')}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm text-slate-700">双声道 (立体声)</span>
                  </label>
                  <label className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                    <input
                      type="radio"
                      name="channel"
                      value="left"
                      checked={exportChannelOption === 'left'}
                      onChange={(e) => setExportChannelOption(e.target.value as 'both' | 'left' | 'right')}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm text-slate-700">仅左声道 (L)</span>
                  </label>
                  <label className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                    <input
                      type="radio"
                      name="channel"
                      value="right"
                      checked={exportChannelOption === 'right'}
                      onChange={(e) => setExportChannelOption(e.target.value as 'both' | 'left' | 'right')}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm text-slate-700">仅右声道 (R)</span>
                  </label>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200">
                <div className="flex gap-3">
                  <button
                    onClick={closeExportModal}
                    className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={exportRegion}
                    disabled={isExporting}
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {isExporting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        导出中...
                      </>
                    ) : (
                      <>
                        <Download size={16} />
                        导出
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SplitterPage;
