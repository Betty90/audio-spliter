import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, FileAudio, Play, Pause, Square, ZoomIn, ZoomOut, Scissors, Download, ArrowLeft } from 'lucide-react';
import { ACCEPTED_MIME_TYPES } from '../constants';

interface SplitterPageProps {
  onBack: () => void;
}

interface AudioRegion {
  id: string;
  start: number;
  end: number;
  color: string;
}

const SplitterPage: React.FC<SplitterPageProps> = ({ onBack }) => {
  // File state
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  // Zoom state (pixels per second)
  const [zoom, setZoom] = useState(100);
  const MIN_ZOOM = 10;
  const MAX_ZOOM = 1000;
  
  // Regions
  const [regions, setRegions] = useState<AudioRegion[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [isLooping, setIsLooping] = useState(false);
  
  // Refs
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveformContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  
  // Audio data for waveform
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

  // Delete selected region
  const deleteSelectedRegion = () => {
    if (!selectedRegionId) return;
    setRegions(prev => prev.filter(r => r.id !== selectedRegionId));
    setSelectedRegionId(null);
  };

  // Export selected region
  const exportRegion = async () => {
    if (!selectedRegionId || !audioFile || !audioBuffer) return;
    
    const region = regions.find(r => r.id === selectedRegionId);
    if (!region) return;
    
    // TODO: Implement export logic
    console.log('Exporting region:', region);
  };

  // Update time display
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
                
                <div className="w-px h-8 bg-slate-200 mx-2" />
                
                {/* Time display */}
                <div className="text-sm font-mono text-slate-600">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {/* Region controls */}
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
                      onClick={deleteSelectedRegion}
                      className="px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium transition-colors"
                    >
                      删除
                    </button>
                    <button
                      onClick={exportRegion}
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
                    className="block"
                    style={{ width: duration * zoom, height: 300 }}
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
    </div>
  );
};

export default SplitterPage;
