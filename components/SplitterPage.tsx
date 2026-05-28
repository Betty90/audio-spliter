import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, FileAudio, Play, Pause, Square, ZoomIn, ZoomOut, Download, Repeat, X, AlertCircle } from 'lucide-react';
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
  const [waveformHeight, setWaveformHeight] = useState(400);
  const [amplitudeScale, setAmplitudeScale] = useState(2.0);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveformContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [channelData, setChannelData] = useState<Float32Array[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    
    const file = fileList[0];
    
    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('文件大小超过500MB限制');
      return;
    }
    
    // 验证文件类型 - 支持扩展名和 MIME type 两种方式
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    const validExtensions = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.mp4', '.mov', '.webm', '.flac'];
    const validMimeTypes = [
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave',
      'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/flac',
      'video/mp4', 'video/quicktime', 'video/webm'
    ];

    const isValidExtension = fileExtension && validExtensions.includes(`.${fileExtension}`);
    const isValidMimeType = file.type && validMimeTypes.some(mime => file.type.includes(mime.split('/')[1]));

    // 如果 MIME type 为空或不明确，信任文件扩展名
    const isValidType = isValidExtension || isValidMimeType;

    if (!isValidType) {
      setError('不支持的文件格式。请上传 MP3, WAV, M4A, MP4, AAC, OGG 或 FLAC 格式');
      return;
    }
    
    setError(null);
    setAudioFile(file);
    setRegions([]);
    setSelectedRegionId(null);
    setCurrentTime(0);
    setIsPlaying(false);
    
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    setIsLoading(true);
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const buffer = await audioContext.decodeAudioData(arrayBuffer);
      setAudioBuffer(buffer);
      
      const channels: Float32Array[] = [];
      for (let i = 0; i < buffer.numberOfChannels; i++) {
        channels.push(buffer.getChannelData(i));
      }
      setChannelData(channels);
      setDuration(buffer.duration);
    } catch (err) {
      console.error('Failed to load audio:', err);
      setError('无法加载音频文件。文件可能已损坏或格式不受支持。');
      setAudioFile(null);
      setAudioUrl(null);
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlayback();
          break;
        case 'Delete':
        case 'Backspace':
          if (selectedRegionId && !isExportModalOpen) {
            deleteSelectedRegion();
          }
          break;
        case 'n':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            addRegion();
          }
          break;
        case 'e':
          if ((e.ctrlKey || e.metaKey) && selectedRegionId) {
            e.preventDefault();
            openExportModal();
          }
          break;
        case '+':
        case '=':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            zoomIn();
          }
          break;
        case '-':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            zoomOut();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, selectedRegionId, isExportModalOpen]);

  const addRegion = () => {
    const regionDuration = 5;
    const maxDuration = 300;
    
    let start = currentTime;
    let end = Math.min(currentTime + regionDuration, duration);
    
    if (duration > maxDuration) {
      start = 0;
      end = Math.min(regionDuration, duration);
    }
    
    const newRegion: AudioRegion = {
      id: `region-${Date.now()}`,
      start,
      end,
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
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = x / zoom;
    
    const HANDLE_WIDTH = 6;
    
    // Check if clicking on an existing region
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
    
    // Clicking on empty area - start selection
    setIsSelecting(true);
    setSelectionStart(time);
    setSelectionEnd(time);
    setSelectedRegionId(null);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = Math.max(0, Math.min(x / zoom, duration));
    
    if (dragState.type === 'none' && !isSelecting) {
      const HANDLE_WIDTH = 6;
      let cursorSet = false;
      
      for (const region of regions) {
        const x1 = region.start * zoom;
        const x2 = region.end * zoom;
        
        if (Math.abs(x - x1) <= HANDLE_WIDTH || Math.abs(x - x2) <= HANDLE_WIDTH) {
          canvasRef.current.style.cursor = 'ew-resize';
          cursorSet = true;
          break;
        }
        
        if (x >= x1 && x <= x2) {
          canvasRef.current.style.cursor = 'move';
          cursorSet = true;
          break;
        }
      }
      
      if (!cursorSet) {
        canvasRef.current.style.cursor = 'default';
      }
    }
    
    if (isSelecting) {
      setSelectionEnd(time);
      return;
    }
    
    if (dragState.type === 'none') return;
    
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
    if (isSelecting && selectionStart !== null && selectionEnd !== null) {
      const start = Math.min(selectionStart, selectionEnd);
      const end = Math.max(selectionStart, selectionEnd);
      const duration = end - start;
      
      // Only create region if selection is > 0.1 seconds
      if (duration > 0.1) {
        const newRegion: AudioRegion = {
          id: `region-${Date.now()}`,
          start,
          end,
          color: `hsl(${Math.random() * 360}, 70%, 60%)`
        };
        setRegions(prev => [...prev, newRegion]);
        setSelectedRegionId(newRegion.id);
      }
    }
    
    setIsSelecting(false);
    setSelectionStart(null);
    setSelectionEnd(null);
    setDragState({ type: 'none' });
    
    if (canvasRef.current) {
      canvasRef.current.style.cursor = 'default';
    }
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
    
    // HSL to RGBA converter for transparent fills
    const hslToRgba = (hsl: string, alpha: number): string => {
      const match = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
      if (!match) return hsl;
      const h = parseInt(match[1]) / 360;
      const s = parseInt(match[2]) / 100;
      const l = parseInt(match[3]) / 100;
      
      const hue2rgb = (p: number, q: number, t: number): number => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      const r = Math.round(hue2rgb(p, q, h + 1/3) * 255);
      const g = Math.round(hue2rgb(p, q, h) * 255);
      const b = Math.round(hue2rgb(p, q, h - 1/3) * 255);
      
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas size
    const width = duration * zoom;
    const height = waveformHeight + 30; // 为时间轴留出空间
    canvas.width = width;
    canvas.height = height;
    
    // Clear canvas
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    
    // Draw channels
    const channelHeight = height / channelData.length;
    
    channelData.forEach((data, channelIndex) => {
      const yOffset = channelIndex * channelHeight;
      const centerY = yOffset + channelHeight / 2;
      
      ctx.beginPath();
      ctx.strokeStyle = channelIndex === 0 ? '#007a3d' : '#f2b91f';
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
        
        const amplitude = (channelHeight / 2 - 2) * amplitudeScale;
        const y1 = centerY + min * amplitude;
        const y2 = centerY + max * amplitude;
        
        ctx.moveTo(x, y1);
        ctx.lineTo(x, y2);
      }
      
      ctx.stroke();
      
      // Draw channel label
      if (channelData.length > 1) {
        ctx.fillStyle = '#64748b';
        ctx.font = '12px sans-serif';
        ctx.fillText(channelIndex === 0 ? 'L' : 'R', 5, yOffset + 15);
      }
    });
    
    if (channelData.length > 1) {
      const separatorY = height / 2;
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(0, separatorY);
      ctx.lineTo(width, separatorY);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    
    if (isSelecting && selectionStart !== null && selectionEnd !== null) {
      const x1 = Math.min(selectionStart, selectionEnd) * zoom;
      const x2 = Math.max(selectionStart, selectionEnd) * zoom;
      const selWidth = x2 - x1;
      
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#007a3d';
      ctx.fillRect(x1, 0, selWidth, height);
      ctx.restore();
      
      ctx.strokeStyle = '#007a3d';
      ctx.lineWidth = 2;
      ctx.strokeRect(x1, 0, selWidth, height);
    }
    
    // Draw regions
    regions.forEach(region => {
      const x1 = region.start * zoom;
      const x2 = region.end * zoom;
      const regionWidth = x2 - x1;
      
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = region.color;
      ctx.fillRect(x1, 0, regionWidth, height);
      ctx.restore();
      
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
    ctx.lineTo(playheadX, waveformHeight);
    ctx.stroke();

    // Draw time axis
    ctx.fillStyle = '#64748b';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';

    const timeInterval = Math.max(1, Math.floor(duration / 10)); // 显示大约10个时间点
    for (let t = 0; t <= duration; t += timeInterval) {
      const x = t * zoom;
      // 在时间轴位置绘制刻度
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, waveformHeight);
      ctx.lineTo(x, waveformHeight + 5);
      ctx.stroke();
      // 绘制时间文字
      const minutes = Math.floor(t / 60);
      const seconds = Math.floor(t % 60);
      const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      ctx.fillText(timeStr, x, waveformHeight + 18);
    }
    
  }, [channelData, duration, zoom, regions, currentTime, waveformHeight, amplitudeScale, isSelecting, selectionStart, selectionEnd]);

  // Format time
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 100);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full w-full p-4 lg:p-5 overflow-hidden gap-4">
      {/* Header */}
      <div className="flex justify-between items-center rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900 leading-tight">音频分割</h2>
          <p className="text-slate-500 text-sm">可视化波形编辑、拖拽选择片段并按声道导出</p>
        </div>
        
        <div className="flex items-center gap-2">
          {!audioFile ? (
            <button
              onClick={() => document.getElementById('splitter-file-upload')?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--psbc-green)] hover:bg-[var(--psbc-green-dark)] text-white rounded-lg font-medium transition-colors"
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
                className="tool-button"
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

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle size={18} />
            <span className="text-sm">{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div
        className="flex-1 flex flex-col overflow-hidden min-h-0"
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={(e) => {
          e.preventDefault();
          handleFileUpload(e.dataTransfer.files);
        }}
      >
        {!audioFile ? (
          <div className="flex-1 flex flex-col items-center justify-center w-full h-full rounded-xl border border-dashed border-slate-300 bg-white shadow-inner">
            <label
              className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-slate-50 transition-colors rounded-xl"
              onClick={() => document.getElementById('splitter-file-upload')?.click()}
            >
              <div className="mb-4 rounded-2xl bg-slate-100 p-5">
                <Upload size={42} className="text-slate-500" />
              </div>
              <span className="font-semibold text-slate-700 text-lg">点击或拖拽上传音频</span>
              <span className="text-sm text-slate-400 mt-2">支持 MP3、WAV、M4A 等格式</span>
            </label>
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="min-h-14 bg-white border border-slate-200 rounded-xl shadow-sm flex items-center justify-between px-3 py-2 gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {/* Playback controls */}
                <button
                  onClick={togglePlayback}
                  className="p-2 bg-[var(--psbc-green)] hover:bg-[var(--psbc-green-dark)] text-white rounded-lg transition-colors"
                >
                  {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                </button>
                <button
                  onClick={stopPlayback}
                  className="p-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg transition-colors"
                >
                  <Square size={18} />
                </button>
                <button
                  onClick={() => setIsLooping(!isLooping)}
                  className={`p-2 rounded-lg transition-colors border ${isLooping ? 'bg-[var(--psbc-green)] text-white border-[var(--psbc-green)]' : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'}`}
                  title={isLooping ? '循环播放开启' : '循环播放关闭'}
                >
                  <Repeat size={18} />
                </button>

                <div className="w-px h-8 bg-slate-200 mx-2" />

                <div className="text-sm font-mono text-slate-600 whitespace-nowrap">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </div>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto shrink-0">
                {selectedRegionId && (
                  <>
                    <button
                      onClick={() => playRegion(selectedRegionId)}
                      className="p-2 bg-white border border-slate-200 hover:border-[var(--psbc-green)] hover:text-[var(--psbc-green)] text-slate-700 rounded-lg transition-colors"
                      title="播放片段"
                    >
                      <Play size={16} />
                    </button>
                    <button
                      onClick={deleteSelectedRegion}
                      className="px-3 py-2 bg-white border border-slate-200 hover:border-red-300 hover:text-red-600 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                    >
                      删除
                    </button>
                    <button
                      onClick={openExportModal}
                      className="flex items-center gap-1 px-3 py-2 bg-[var(--psbc-green)] hover:bg-[var(--psbc-green-dark)] text-white rounded-lg text-sm font-medium transition-colors"
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
                <div className="w-px h-8 bg-slate-200 mx-2" />
                <button
                  onClick={() => setWaveformHeight(prev => Math.max(100, prev - 20))}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                  title="减小高度"
                >
                  <span className="text-xs font-bold text-slate-600">H-</span>
                </button>
                <span className="text-xs text-slate-500 w-12 text-center">{waveformHeight}px</span>
                <button
                  onClick={() => setWaveformHeight(prev => Math.min(600, prev + 20))}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                  title="增加高度"
                >
                  <span className="text-xs font-bold text-slate-600">H+</span>
                </button>
              </div>
            </div>
            
            {/* Waveform display */}
            <div className="overflow-auto bg-white border border-slate-200 rounded-xl shadow-sm p-3 flex-1 min-h-0">
              {isLoading ? (
                <div className="flex items-center justify-center h-full min-h-[260px]">
                  <div className="text-slate-500">加载音频中...</div>
                </div>
              ) : (
                <div
                  ref={waveformContainerRef}
                  className="bg-white rounded-lg overflow-hidden"
                  style={{ minWidth: duration * zoom }}
                >
                  <canvas
                    ref={canvasRef}
                    className="block"
                    id="waveform-canvas"
                    style={{ width: duration * zoom, height: waveformHeight, cursor: 'default' }}
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
              <div className="h-44 bg-white border border-slate-200 rounded-xl shadow-sm overflow-auto">
                <div className="p-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">片段列表</h4>
                  <div className="space-y-1.5">
                    {regions.map(region => (
                      <div
                        key={region.id}
                        onClick={() => setSelectedRegionId(region.id)}
                        className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors ${
                          selectedRegionId === region.id
                            ? 'bg-[var(--psbc-green-soft)] border border-[var(--psbc-green-line)]'
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
                  {audioBuffer && audioBuffer.numberOfChannels === 1 ? (
                    <label className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                      <input
                        type="radio"
                        name="channel"
                        value="both"
                        checked={exportChannelOption === 'both'}
                        onChange={(e) => setExportChannelOption(e.target.value as 'both' | 'left' | 'right')}
                        className="w-4 h-4 text-[var(--psbc-green)]"
                      />
                      <span className="text-sm text-slate-700">单声道</span>
                    </label>
                  ) : (
                    <>
                      <label className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                        <input
                          type="radio"
                          name="channel"
                          value="both"
                          checked={exportChannelOption === 'both'}
                          onChange={(e) => setExportChannelOption(e.target.value as 'both' | 'left' | 'right')}
                          className="w-4 h-4 text-[var(--psbc-green)]"
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
                          className="w-4 h-4 text-[var(--psbc-green)]"
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
                          className="w-4 h-4 text-[var(--psbc-green)]"
                        />
                        <span className="text-sm text-slate-700">仅右声道 (R)</span>
                      </label>
                    </>
                  )}
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
                    className="flex-1 px-4 py-2 bg-[var(--psbc-green)] hover:bg-[var(--psbc-green-dark)] disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
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
