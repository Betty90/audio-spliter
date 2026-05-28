import React, { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';
import { Play, Pause, SkipBack, SkipForward, ZoomIn, ZoomOut, Scissors, Save, Trash2, Merge, RefreshCw, Settings, Download, Loader2 } from 'lucide-react';
import { AudioFile, AudioSegment } from '../types';
import { SPEAKER_COLORS } from '../constants';
import ConfirmDialog, { ConfirmConfig } from './ConfirmDialog';
import { extractAudioSegment } from '../utils/audioUtils';

interface WaveformSidebarProps {
  file: AudioFile | null;
  onUpdateSegments: (fileId: string, segments: AudioSegment[]) => void;
  onClose: () => void;
  activeSegmentId?: string | null;
  onSegmentSelect?: (id: string | null) => void;
  onReanalyze?: (fileId: string) => void;
  onOpenSettings?: (fileId: string) => void;
}

const WaveformSidebar: React.FC<WaveformSidebarProps> = ({ file, onUpdateSegments, onClose, activeSegmentId, onSegmentSelect, onReanalyze, onOpenSettings }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(10);
  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [width, setWidth] = useState(460);
  const [isResizing, setIsResizing] = useState(false);
  const wsFileIdRef = useRef<string | null>(null);
  
  const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });
  
  // Audio channel info
  const [channelCount, setChannelCount] = useState<number>(1);

  // Handle resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      // Calculate new width based on mouse position from right edge of screen
      const newWidth = window.innerWidth - e.clientX;
      const maxWidth = window.innerWidth * 0.8;
      const minWidth = 360;

      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = 'default';
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ew-resize';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
    };
  }, [isResizing]);

  // Handle pinch-to-zoom (Trackpad)
  useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const handleWheel = (e: WheelEvent) => {
          // Check for pinch gesture (Ctrl + Wheel on trackpads)
          if (e.ctrlKey) {
              e.preventDefault();
              
              // Adjust sensitivity as needed
              const sensitivity = 2;
              setZoom(prev => {
                  // deltaY is negative when zooming in (pinching out)
                  const newZoom = prev - e.deltaY * sensitivity;
                  return Math.min(1000, Math.max(10, newZoom));
              });
          }
      };

      // Add passive: false to allow preventDefault
      container.addEventListener('wheel', handleWheel, { passive: false });

      return () => {
          container.removeEventListener('wheel', handleWheel);
      };
  }, []);

  const [localSegments, setLocalSegments] = useState<AudioSegment[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [selectedSegments, setSelectedSegments] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const lastNotifiedIdRef = useRef<string | null>(null);

  // Handle external selection (from AnalysisTable)
  useEffect(() => {
      // Only update if activeSegmentId changed AND it's different from what we just notified the parent about.
      // This prevents the parent's echo from resetting our local multi-selection state.
      if (activeSegmentId && activeSegmentId !== lastNotifiedIdRef.current) {
          setActiveRegion(activeSegmentId);
          setSelectedSegments(new Set([activeSegmentId]));
          setLastSelectedId(activeSegmentId);
          lastNotifiedIdRef.current = activeSegmentId; // Sync ref to avoid double update
          
          // Scroll to segment in waveform
          const seg = localSegments.find(s => s.id === activeSegmentId);
          if (seg && wavesurferRef.current) {
              // Center the segment
              const center = seg.start + (seg.end - seg.start) / 2;
              const duration = wavesurferRef.current.getDuration();
              if (duration > 0) {
                  const progress = center / duration;
                  wavesurferRef.current.seekTo(progress);
              }
          }

          // Scroll list item into view
          const listItem = document.getElementById(`segment-item-${activeSegmentId}`);
          if (listItem) {
              listItem.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
      }
  }, [activeSegmentId, localSegments]);

  // Sync playback to list selection
  useEffect(() => {
      if (!isPlaying || !wavesurferRef.current) return;
      
      // If user has multi-selected, don't auto-change selection
      if (selectedSegments.size > 1) return;

      const currentSeg = localSegments.find(s => currentTime >= s.start && currentTime < s.end);
      if (currentSeg && currentSeg.id !== lastSelectedId) {
          setSelectedSegments(new Set([currentSeg.id]));
          setLastSelectedId(currentSeg.id);
          setActiveRegion(currentSeg.id);
          
          const el = document.getElementById(`segment-item-${currentSeg.id}`);
          if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
      }
  }, [currentTime, isPlaying, localSegments, lastSelectedId, selectedSegments.size]);

  // Sync local segments when file changes (regions are handled in ready callback)
  useEffect(() => {
    if (file) {
      setLocalSegments(file.segments);
      setHasUnsavedChanges(false);
    }
  }, [file?.id, file?.segments]);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!containerRef.current || !file) return;

    setIsReady(false);
    wsFileIdRef.current = file.id;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#94a3b8',
      progressColor: '#007a3d',
      cursorColor: '#ef4444',
      barWidth: 2,
      barGap: 3,
      height: channelCount > 1 ? 160 : 240,
      url: file.blobUrl,
      minPxPerSec: zoom,
      autoScroll: true,
      autoCenter: true,
      // @ts-ignore - wavesurfer.js type definition mismatch
      splitChannels: channelCount > 1,
      splitChannelsOptions: channelCount > 1 ? {
        overlay: false,
        channelColors: {
          0: { progressColor: '#007a3d', waveColor: '#8bc8a3' },  // 左声道 - 邮储绿
          1: { progressColor: '#f2b91f', waveColor: '#f8d879' },  // 右声道 - 邮储金
        },
        filterChannels: [],
        relativeNormalization: true,
      } : undefined,
    });

    const wsRegions = RegionsPlugin.create();
    ws.registerPlugin(wsRegions);

    ws.on('ready', () => {
      setIsReady(true);
      setDuration(ws.getDuration());
      
      // 检测音频声道数，如果是第一次检测到多声道，需要重新初始化
      const decodedData = ws.getDecodedData();
      if (decodedData) {
        const detectedChannels = decodedData.numberOfChannels;
        console.log(`Audio channels detected: ${detectedChannels}, current: ${channelCount}`);
        
        // 如果检测到的声道数与当前配置不同，更新配置并重新初始化
        if (detectedChannels !== channelCount) {
          setChannelCount(detectedChannels);
          // 不在这里添加 regions，因为组件会重新初始化
          return;
        }
      }
      
      // 添加 regions（只有在声道配置正确时才执行）
      if (regionsRef.current && file?.segments) {
        regionsRef.current.clearRegions();
        file.segments.forEach((seg) => {
          const colorIndex = Math.abs(seg.speaker.length) % SPEAKER_COLORS.length;
          regionsRef.current!.addRegion({
            id: seg.id,
            start: seg.start,
            end: seg.end,
            content: seg.speaker,
            color: SPEAKER_COLORS[colorIndex],
            drag: true,
            resize: true,
          });
        });
      }
    });

    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));
    ws.on('audioprocess', (time) => setCurrentTime(time));
    ws.on('interaction', (newTime) => setCurrentTime(newTime));
    
    wsRegions.on('region-updated', (region) => {
        if (!ws.getDuration()) return;

        setLocalSegments(prev => {
            const newSegs = prev.map(s => {
                if (s.id === region.id) {
                    return { ...s, start: region.start, end: region.end };
                }
                return s;
            }).sort((a, b) => a.start - b.start);
            return newSegs;
        });
        setHasUnsavedChanges(true);
    });

    wsRegions.on('region-clicked', (region, e) => {
      e.stopPropagation();
      setActiveRegion(region.id);
      ws.setTime(region.start);
      
      // Notify parent
      if (onSegmentSelect) {
          onSegmentSelect(region.id);
          lastNotifiedIdRef.current = region.id;
      }
      
      // Handle selection logic for regions click
      setSelectedSegments(new Set([region.id]));
      setLastSelectedId(region.id);
    });

    wavesurferRef.current = ws;
    regionsRef.current = wsRegions;

    return () => {
      ws.destroy();
      wavesurferRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.id, channelCount]);

  // Handle Zoom updates
  useEffect(() => {
    if (wavesurferRef.current && isReady) {
      try {
        wavesurferRef.current.zoom(zoom);
      } catch (e) {
        console.warn('WaveSurfer zoom error:', e);
      }
    }
  }, [zoom, isReady]);

  const togglePlay = () => {
    if (wavesurferRef.current && isReady) {
        wavesurferRef.current.playPause();
    }
  };
  
  const skip = (seconds: number) => {
    if (wavesurferRef.current && isReady) {
        wavesurferRef.current.skip(seconds);
    }
  };

  const addRegionAtCurrentTime = () => {
      if (!wavesurferRef.current || !regionsRef.current || !file || !isReady) return;
      
      const currentTime = wavesurferRef.current.getCurrentTime();
      const duration = wavesurferRef.current.getDuration();
      const end = Math.min(currentTime + 2.0, duration);

      const newSeg: AudioSegment = {
          id: `manual-${Date.now()}`,
          start: currentTime,
          end: end,
          speaker: '新音色'
      };
      
      const colorIndex = Math.abs(newSeg.speaker.length) % SPEAKER_COLORS.length;
      regionsRef.current.addRegion({
          id: newSeg.id,
          start: newSeg.start,
          end: newSeg.end,
          content: newSeg.speaker,
          color: SPEAKER_COLORS[colorIndex],
          drag: true,
          resize: true,
      });

      setLocalSegments(prev => [...prev, newSeg].sort((a,b) => a.start - b.start));
      setHasUnsavedChanges(true);
  };

  const handleDeleteSegment = (segmentId: string) => {
      if (!regionsRef.current) return;
      
      const region = regionsRef.current.getRegions().find(r => r.id === segmentId);
      if (region) {
          region.remove();
      }

      setLocalSegments(prev => prev.filter(s => s.id !== segmentId));
      setHasUnsavedChanges(true);
  };

  const handleSpeakerChange = (segmentId: string, newSpeaker: string) => {
      if (regionsRef.current) {
          const region = regionsRef.current.getRegions().find(r => r.id === segmentId);
          if (region) {
              const colorIndex = Math.abs(newSpeaker.length) % SPEAKER_COLORS.length;
              region.setOptions({ 
                  content: newSpeaker,
                  color: SPEAKER_COLORS[colorIndex]
              });
          }
      }

      setLocalSegments(prev => prev.map(s => 
          s.id === segmentId ? { ...s, speaker: newSpeaker } : s
      ));
      setHasUnsavedChanges(true);
  };

  const handleRemarkChange = (segmentId: string, newRemark: string) => {
      setLocalSegments(prev => prev.map(s => 
          s.id === segmentId ? { ...s, remark: newRemark } : s
      ));
      setHasUnsavedChanges(true);
  };

  const handlePlaySegment = (segmentId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (regionsRef.current && wavesurferRef.current) {
          const region = regionsRef.current.getRegions().find(r => r.id === segmentId);
          if (region) {
              wavesurferRef.current.play(region.start, region.end);
          }
      }
  };

  const handleSave = () => {
      if (!file) return;
      onUpdateSegments(file.id, localSegments);
      setHasUnsavedChanges(false);
  };

  const handleSegmentClick = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      
      if (onSegmentSelect) {
          onSegmentSelect(id);
          lastNotifiedIdRef.current = id;
      }

      if (e.shiftKey && lastSelectedId) {
          // Range selection
          const lastIdx = localSegments.findIndex(s => s.id === lastSelectedId);
          const currIdx = localSegments.findIndex(s => s.id === id);
          
          if (lastIdx !== -1 && currIdx !== -1) {
              const start = Math.min(lastIdx, currIdx);
              const end = Math.max(lastIdx, currIdx);
              
              const newSelected = new Set(selectedSegments);
              // Add range to existing selection
              for (let i = start; i <= end; i++) {
                  newSelected.add(localSegments[i].id);
              }
              setSelectedSegments(newSelected);
              // Do not update lastSelectedId to keep the anchor
          }
      } else if (e.ctrlKey || e.metaKey) {
          // Multi-select toggle
          const newSelected = new Set(selectedSegments);
          if (newSelected.has(id)) {
              newSelected.delete(id);
          } else {
              newSelected.add(id);
          }
          setSelectedSegments(newSelected);
          setLastSelectedId(id);
      } else {
          // Single select
          setSelectedSegments(new Set([id]));
          setActiveRegion(id);
          setLastSelectedId(id);
          
          const seg = localSegments.find(s => s.id === id);
          if (seg && wavesurferRef.current) {
              wavesurferRef.current.setTime(seg.start);
              wavesurferRef.current.play();
          }
      }
  };

  const handleSegmentFocus = (id: string) => {
      setSelectedSegments(new Set([id]));
      setActiveRegion(id);
      setLastSelectedId(id);
      
      const seg = localSegments.find(s => s.id === id);
      if (seg && wavesurferRef.current) {
          const currentTime = wavesurferRef.current.getCurrentTime();
          // Only seek if we are not already inside this segment
          if (currentTime < seg.start || currentTime > seg.end) {
              wavesurferRef.current.setTime(seg.start);
          }
      }
  };

  const handleMergeSegments = () => {
      if (selectedSegments.size < 2) return;

      const segmentsToMerge = localSegments.filter(s => selectedSegments.has(s.id));
      if (segmentsToMerge.length < 2) return;

      segmentsToMerge.sort((a, b) => a.start - b.start);

      const firstSeg = segmentsToMerge[0];
      const lastSeg = segmentsToMerge[segmentsToMerge.length - 1];

      const newSegment: AudioSegment = {
          id: `merged-${Date.now()}`,
          start: firstSeg.start,
          end: lastSeg.end,
          speaker: firstSeg.speaker
      };

      if (regionsRef.current) {
          segmentsToMerge.forEach(s => {
              const region = regionsRef.current!.getRegions().find(r => r.id === s.id);
              if (region) region.remove();
          });

          const colorIndex = Math.abs(newSegment.speaker.length) % SPEAKER_COLORS.length;
          regionsRef.current.addRegion({
              id: newSegment.id,
              start: newSegment.start,
              end: newSegment.end,
              content: newSegment.speaker,
              color: SPEAKER_COLORS[colorIndex],
              drag: true,
              resize: true,
          });
      }

      const remainingSegments = localSegments.filter(s => !selectedSegments.has(s.id));
      const newLocalSegments = [...remainingSegments, newSegment].sort((a, b) => a.start - b.start);
      
      setLocalSegments(newLocalSegments);
      setSelectedSegments(new Set([newSegment.id]));
      setLastSelectedId(newSegment.id);
      setActiveRegion(newSegment.id);
      setHasUnsavedChanges(true);
      
      // Also notify parent of the new segment selection
      if (onSegmentSelect) {
          onSegmentSelect(newSegment.id);
          lastNotifiedIdRef.current = newSegment.id;
      }
  };

  const handleDeleteSelected = () => {
      if (selectedSegments.size === 0) return;
      
      setConfirmConfig({
          isOpen: true,
          title: '删除片段',
          message: `确定要删除选中的 ${selectedSegments.size} 个片段吗？`,
          confirmText: '删除',
          onConfirm: () => {
              if (regionsRef.current) {
                  selectedSegments.forEach(id => {
                      const region = regionsRef.current!.getRegions().find(r => r.id === id);
                      if (region) region.remove();
                  });
              }

              setLocalSegments(prev => prev.filter(s => !selectedSegments.has(s.id)));
              setSelectedSegments(new Set());
              setLastSelectedId(null);
              setActiveRegion(null);
              setHasUnsavedChanges(true);
          }
      });
  };

  const handleDownloadSegment = async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const seg = localSegments.find(s => s.id === id);
      if (!seg || !file?.file || downloadingId) return;

      setDownloadingId(id);
      try {
          const source = wavesurferRef.current?.getDecodedData() || file.file;
          const blob = await extractAudioSegment(source, seg.start, seg.end, file.name);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          // Format filename: originalName_speaker_start-end.ext (保持原格式)
          const originalName = file.name.replace(/\.[^/.]+$/, "");
          const ext = file.name.split('.').pop() || 'wav';
          a.download = `${originalName}_${seg.speaker}_${seg.start.toFixed(1)}-${seg.end.toFixed(1)}.${ext}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
      } catch (error) {
          console.error("Failed to extract audio segment:", error);
          alert("导出音频片段失败，请重试。");
      } finally {
          setDownloadingId(null);
      }
  };

  if (!file) {
      return (
          <div className="w-96 h-full border-l border-slate-200 bg-white p-6 flex flex-col items-center justify-center text-slate-400">
              <p>选择文件以查看波形</p>
          </div>
      );
  }

  return (
    <div 
        style={{ width: `${width}px` }}
        className="h-full border-l border-slate-200 bg-white flex flex-col shadow-xl z-10 relative flex-shrink-0 transition-none"
    >
      {/* Resize Handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-[var(--psbc-green)] transition-colors z-50 -ml-0.5"
        onMouseDown={(e) => {
            e.preventDefault(); // Prevent text selection
            setIsResizing(true);
        }}
      />

      {/* Header - Fixed */}
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0 bg-white z-20 gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900 truncate max-w-[250px]" title={file.name}>
            {file.name}
          </h3>
          <p className="text-xs text-slate-500">
            {isReady ? `${localSegments.length} 个片段 · ${duration.toFixed(1)}s` : '加载波形中...'}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
            {onOpenSettings && (
                <button 
                    onClick={() => onOpenSettings(file.id)}
                    className="icon-button"
                    title="文件专属配置"
                >
                    <Settings size={16} />
                </button>
            )}
            {onReanalyze && (
                <button 
                    onClick={() => onReanalyze(file.id)}
                    className="tool-button px-2 py-1 text-xs"
                    title="使用当前配置重新分析"
                >
                    <RefreshCw size={12} />
                </button>
            )}
            {hasUnsavedChanges && (
                <button 
                    onClick={handleSave}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-[var(--psbc-green)] text-white text-xs rounded-lg hover:bg-[var(--psbc-green-dark)] transition-colors animate-pulse font-semibold"
                >
                    <Save size={12} />
                    保存
                </button>
            )}
            <button onClick={onClose} className="icon-button">
                <span className="sr-only">关闭</span>
                &times;
            </button>
        </div>
      </div>

      {/* Player Section - Fixed/Sticky */}
      <div className="flex-shrink-0 border-b border-slate-200 bg-slate-50/80 p-3 space-y-3 z-10">
         {/* Combined Controls Row */}
         <div className="flex items-center justify-between gap-3">
            
            {/* Playback Controls */}
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
                <button onClick={() => skip(-10)} disabled={!isReady} className="px-1.5 py-1 text-[10px] font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded disabled:opacity-30" title="后退10秒">-10s</button>
                <button onClick={() => skip(-5)} disabled={!isReady} className="p-1 text-slate-600 hover:bg-slate-100 rounded disabled:opacity-50" title="后退5秒"><SkipBack size={16} /></button>
                <button onClick={() => skip(-1)} disabled={!isReady} className="px-1.5 py-1 text-[10px] font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded disabled:opacity-30" title="后退1秒">-1s</button>
                
                <button 
                    onClick={togglePlay} 
                    disabled={!isReady}
                    className="w-8 h-8 bg-[var(--psbc-green)] hover:bg-[var(--psbc-green-dark)] text-white rounded-md flex items-center justify-center shadow-sm transition-transform hover:scale-105 disabled:bg-slate-300 disabled:scale-100 mx-1 shrink-0"
                >
                    {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
                </button>

                <button onClick={() => skip(1)} disabled={!isReady} className="px-1.5 py-1 text-[10px] font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded disabled:opacity-30" title="快进1秒">+1s</button>
                <button onClick={() => skip(5)} disabled={!isReady} className="p-1 text-slate-600 hover:bg-slate-100 rounded disabled:opacity-50" title="快进5秒"><SkipForward size={16} /></button>
                <button onClick={() => skip(10)} disabled={!isReady} className="px-1.5 py-1 text-[10px] font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded disabled:opacity-30" title="快进10秒">+10s</button>
            </div>

            {/* Tools */}
            <div className="flex items-center gap-1.5 shrink-0">
                <button 
                    onClick={addRegionAtCurrentTime}
                    disabled={!isReady}
                    className="tool-button px-2 py-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    title="添加片段"
                >
                    <Scissors size={14} />
                    <span className="hidden sm:inline">添加</span>
                </button>
                <button 
                    onClick={handleMergeSegments}
                    disabled={!isReady || selectedSegments.size < 2}
                    className="tool-button px-2 py-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    title="按住 Ctrl/Cmd 多选，Shift 连选"
                >
                    <Merge size={14} />
                    <span className="hidden sm:inline">合并</span>
                    {selectedSegments.size > 1 && <span>({selectedSegments.size})</span>}
                </button>
                <button 
                    onClick={handleDeleteSelected}
                    disabled={!isReady || selectedSegments.size === 0}
                    className="tool-button px-2 py-1.5 text-xs text-red-600 hover:border-red-300 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="删除选中片段"
                >
                    <Trash2 size={14} />
                    <span className="hidden sm:inline">删除</span>
                    {selectedSegments.size > 0 && <span>({selectedSegments.size})</span>}
                </button>
            </div>
        </div>

        {/* Waveform Container */}
        <div className="bg-white rounded-lg border border-slate-200 p-2 relative group shadow-sm">
            <div className="mb-2 flex items-center justify-between text-[11px] text-slate-500">
                <span className="font-mono">{currentTime.toFixed(1)}s / {duration.toFixed(1)}s</span>
                <span>{Math.round(zoom)} px/s</span>
            </div>
            <div ref={containerRef} className="w-full overflow-x-auto" />
            
            {/* Channel Labels - L在上方声道顶部，R在下方声道顶部 */}
            {isReady && channelCount > 1 && (
                <>
                    <span className="absolute left-2 top-2 text-[10px] font-medium text-[var(--psbc-green)] bg-[var(--psbc-green-soft)] px-1.5 py-0.5 rounded z-10 pointer-events-none">L</span>
                    <span className="absolute left-2 top-[168px] text-[10px] font-medium text-amber-600 bg-[var(--psbc-gold-soft)] px-1.5 py-0.5 rounded z-10 pointer-events-none">R</span>
                    {/* 声道分隔线 - 放在两个声道之间 */}
                    <div className="absolute left-0 right-0 top-[168px] border-t border-dashed border-gray-200 z-10 pointer-events-none" />
                </>
            )}
            
            {/* Loading Overlay */}
            {!isReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70 z-10">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[var(--psbc-green)]"></div>
                </div>
            )}

            <div className="absolute top-9 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white/90 rounded-lg shadow-sm border border-slate-200 backdrop-blur-sm z-20">
                 <button onClick={() => setZoom(prev => Math.max(10, Math.floor(prev * 0.8)))} className="p-1.5 hover:text-[var(--psbc-green)]" title="缩小"><ZoomOut size={16}/></button>
                 <button onClick={() => setZoom(prev => Math.min(1000, Math.ceil(prev * 1.2)))} className="p-1.5 hover:text-[var(--psbc-green)]" title="放大"><ZoomIn size={16}/></button>
            </div>
        </div>
      </div>

      {/* Segment List (Scrollable) */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-white min-h-0">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex justify-between items-center sticky top-0 bg-white py-2 z-10 border-b border-slate-100">
                片段列表
                <span className="text-xs font-normal normal-case text-slate-400">
                    {localSegments.length} 个
                </span>
            </h4>
            {localSegments.map((seg, idx) => (
                <div 
                    key={seg.id}
                    id={`segment-item-${seg.id}`}
                    onClick={(e) => handleSegmentClick(seg.id, e)}
                    className={`p-2.5 rounded-lg text-sm border cursor-pointer hover:shadow-sm transition-all flex items-center gap-3 group scroll-mt-10
                        ${selectedSegments.has(seg.id) || activeSegmentId === seg.id
                            ? 'border-[var(--psbc-green)] bg-[var(--psbc-green-soft)] ring-1 ring-[var(--psbc-green-line)]' 
                            : 'border-slate-100 bg-white hover:border-slate-200'}`}
                >
                    {/* Index Number */}
                    <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-mono font-medium shrink-0 transition-colors
                        ${selectedSegments.has(seg.id) || activeSegmentId === seg.id
                            ? 'bg-[var(--psbc-green)] text-white' 
                            : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'}`}
                    >
                        {idx + 1}
                    </div>

                    <div className="flex flex-col flex-1 min-w-0 mr-2">
                        <input 
                            value={seg.speaker}
                            onChange={(e) => handleSpeakerChange(seg.id, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onFocus={() => handleSegmentFocus(seg.id)}
                            className="font-medium text-slate-800 bg-transparent border-none p-0 focus:ring-0 w-full truncate hover:bg-slate-100 rounded px-1 -ml-1 transition-colors"
                            placeholder="说话人"
                        />
                        <input 
                            value={seg.remark || ''}
                            onChange={(e) => handleRemarkChange(seg.id, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onFocus={() => handleSegmentFocus(seg.id)}
                            className="text-xs text-slate-500 bg-transparent border-none p-0 focus:ring-0 w-full truncate hover:bg-slate-100 rounded px-1 -ml-1 transition-colors mt-0.5"
                            placeholder="添加备注..."
                        />
                        <span className="text-xs text-slate-400 font-mono mt-0.5 block">
                            {seg.start.toFixed(2)}s - {seg.end.toFixed(2)}s
                        </span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <span className="text-xs font-bold text-slate-400">
                            {(seg.end - seg.start).toFixed(2)}s
                        </span>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                            <button 
                                onClick={(e) => handlePlaySegment(seg.id, e)}
                                className="p-1 text-gray-400 hover:text-[var(--psbc-green)] hover:bg-[var(--psbc-green-soft)] rounded"
                                title="播放片段"
                            >
                                <Play size={14} />
                            </button>
                            <button 
                                onClick={(e) => handleDownloadSegment(seg.id, e)}
                                disabled={downloadingId === seg.id}
                                className={`p-1 rounded ${downloadingId === seg.id ? 'text-green-500' : 'text-gray-400 hover:text-green-500 hover:bg-green-50'}`}
                                title="导出片段"
                            >
                                {downloadingId === seg.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                            </button>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteSegment(seg.id);
                                }}
                                className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                                title="删除片段"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                </div>
            ))}
      </div>

      <ConfirmDialog 
        config={confirmConfig} 
        onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))} 
      />
    </div>
  );
};

export default WaveformSidebar;
