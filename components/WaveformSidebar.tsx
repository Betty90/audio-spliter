import React, { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
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

  const [width, setWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const wsFileIdRef = useRef<string | null>(null);
  
  const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  // Handle resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      // Calculate new width based on mouse position from right edge of screen
      const newWidth = window.innerWidth - e.clientX;
      const maxWidth = window.innerWidth * 0.8;
      const minWidth = 300;

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

  // Sync local segments and regions when file changes
  useEffect(() => {
    if (file) {
      setLocalSegments(file.segments);
      setHasUnsavedChanges(false);

      // Update regions if WaveSurfer is ready and matches current file
      if (isReady && regionsRef.current && wsFileIdRef.current === file.id) {
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
    }
  }, [file?.id, file?.segments, isReady]);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!containerRef.current || !file) return;

    setIsReady(false);
    wsFileIdRef.current = file.id;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#94a3b8',
      progressColor: '#3b82f6',
      cursorColor: '#ef4444',
      barWidth: 2,
      barGap: 3,
      height: 240,
      url: file.blobUrl,
      minPxPerSec: zoom,
      autoScroll: true,
      autoCenter: true,
    });

    const wsRegions = RegionsPlugin.create();
    ws.registerPlugin(wsRegions);

    ws.on('ready', () => {
      setIsReady(true);
      setDuration(ws.getDuration());
      // Regions are now handled by the other useEffect
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
  }, [file?.id]);

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
          const blob = await extractAudioSegment(source, seg.start, seg.end);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          // Format filename: originalName_speaker_start-end.wav
          const originalName = file.name.replace(/\.[^/.]+$/, "");
          a.download = `${originalName}_${seg.speaker}_${seg.start.toFixed(1)}-${seg.end.toFixed(1)}.wav`;
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
          <div className="w-80 h-full border-l border-gray-200 bg-white p-6 flex flex-col items-center justify-center text-gray-400">
              <p>选择文件以查看波形</p>
          </div>
      );
  }

  return (
    <div 
        style={{ width: `${width}px` }}
        className="h-full border-l border-gray-200 bg-white flex flex-col shadow-xl z-10 relative flex-shrink-0 transition-none"
    >
      {/* Resize Handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-blue-400 transition-colors z-50 -ml-0.5"
        onMouseDown={(e) => {
            e.preventDefault(); // Prevent text selection
            setIsResizing(true);
        }}
      />

      {/* Header - Fixed */}
      <div className="p-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0 bg-white z-20">
        <div>
          <h3 className="font-semibold text-gray-800 truncate w-48" title={file.name}>
            {file.name}
          </h3>
          <p className="text-xs text-gray-500">
            {isReady ? `检测到 ${localSegments.length} 个片段` : '加载波形中...'}
          </p>
        </div>
        <div className="flex items-center gap-2">
            {onOpenSettings && (
                <button 
                    onClick={() => onOpenSettings(file.id)}
                    className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
                    title="文件专属配置"
                >
                    <Settings size={16} />
                </button>
            )}
            {onReanalyze && (
                <button 
                    onClick={() => onReanalyze(file.id)}
                    className="flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 text-xs rounded-full hover:bg-gray-200 transition-colors"
                    title="使用当前配置重新分析"
                >
                    <RefreshCw size={12} />
                    重新分析
                </button>
            )}
            {hasUnsavedChanges && (
                <button 
                    onClick={handleSave}
                    className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white text-xs rounded-full hover:bg-blue-700 transition-colors animate-pulse"
                >
                    <Save size={12} />
                    保存
                </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <span className="sr-only">关闭</span>
                &times;
            </button>
        </div>
      </div>

      {/* Player Section - Fixed/Sticky */}
      <div className="flex-shrink-0 border-b border-gray-100 bg-gray-50/50 p-4 space-y-3 z-10">
         {/* Combined Controls Row */}
         <div className="flex items-center justify-between gap-2 flex-wrap">
            
            {/* Playback Controls */}
            <div className="flex items-center gap-0.5">
                <button onClick={() => skip(-10)} disabled={!isReady} className="px-1 py-1 text-[10px] font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded disabled:opacity-30" title="后退10秒">-10s</button>
                <button onClick={() => skip(-5)} disabled={!isReady} className="p-1 text-gray-600 hover:bg-gray-100 rounded-full disabled:opacity-50" title="后退5秒"><SkipBack size={16} /></button>
                <button onClick={() => skip(-1)} disabled={!isReady} className="px-1 py-1 text-[10px] font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded disabled:opacity-30" title="后退1秒">-1s</button>
                
                <button 
                    onClick={togglePlay} 
                    disabled={!isReady}
                    className="w-8 h-8 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center justify-center shadow-md transition-transform hover:scale-105 disabled:bg-gray-300 disabled:scale-100 mx-1 shrink-0"
                >
                    {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
                </button>

                <button onClick={() => skip(1)} disabled={!isReady} className="px-1 py-1 text-[10px] font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded disabled:opacity-30" title="快进1秒">+1s</button>
                <button onClick={() => skip(5)} disabled={!isReady} className="p-1 text-gray-600 hover:bg-gray-100 rounded-full disabled:opacity-50" title="快进5秒"><SkipForward size={16} /></button>
                <button onClick={() => skip(10)} disabled={!isReady} className="px-1 py-1 text-[10px] font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded disabled:opacity-30" title="快进10秒">+10s</button>
                
                <div className="text-[10px] font-mono text-gray-500 ml-1 hidden xl:block">
                    {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
                </div>
            </div>

            {/* Tools */}
            <div className="flex items-center gap-1.5">
                <button 
                    onClick={addRegionAtCurrentTime}
                    disabled={!isReady}
                    className="flex items-center justify-center gap-1 py-1.5 px-2 bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-700 rounded-md text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    title="添加片段"
                >
                    <Scissors size={14} />
                    <span className="hidden sm:inline">添加</span>
                </button>
                <button 
                    onClick={handleMergeSegments}
                    disabled={!isReady || selectedSegments.size < 2}
                    className="flex items-center justify-center gap-1 py-1.5 px-2 bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-700 rounded-md text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    title="按住 Ctrl/Cmd 多选，Shift 连选"
                >
                    <Merge size={14} />
                    <span className="hidden sm:inline">合并</span>
                    {selectedSegments.size > 1 && <span>({selectedSegments.size})</span>}
                </button>
                <button 
                    onClick={handleDeleteSelected}
                    disabled={!isReady || selectedSegments.size === 0}
                    className="flex items-center justify-center gap-1 py-1.5 px-2 bg-white border border-gray-200 hover:border-red-300 hover:bg-red-50 text-red-600 rounded-md text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    title="删除选中片段"
                >
                    <Trash2 size={14} />
                    <span className="hidden sm:inline">删除</span>
                    {selectedSegments.size > 0 && <span>({selectedSegments.size})</span>}
                </button>
            </div>
        </div>

        {/* Waveform Container */}
        <div className="bg-white rounded-lg border border-gray-200 p-2 relative group shadow-sm">
            <div ref={containerRef} className="w-full overflow-x-auto" />
            
            {/* Loading Overlay */}
            {!isReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-10">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                </div>
            )}

            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white/80 rounded shadow backdrop-blur-sm z-20">
                 <button onClick={() => setZoom(prev => Math.max(10, Math.floor(prev * 0.8)))} className="p-1 hover:text-blue-600" title="缩小"><ZoomOut size={16}/></button>
                 <button onClick={() => setZoom(prev => Math.min(1000, Math.ceil(prev * 1.2)))} className="p-1 hover:text-blue-600" title="放大"><ZoomIn size={16}/></button>
            </div>
        </div>
      </div>

      {/* Segment List (Scrollable) */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-white">
            <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wider flex justify-between items-center sticky top-0 bg-white py-2 z-10 border-b border-gray-50">
                片段列表
                <span className="text-xs font-normal normal-case text-gray-400">
                    {localSegments.length} 个
                </span>
            </h4>
            {localSegments.map((seg, idx) => (
                <div 
                    key={seg.id}
                    id={`segment-item-${seg.id}`}
                    onClick={(e) => handleSegmentClick(seg.id, e)}
                    className={`p-3 rounded-lg text-sm border cursor-pointer hover:shadow-sm transition-all flex items-center gap-3 group scroll-mt-10
                        ${selectedSegments.has(seg.id) || activeSegmentId === seg.id
                            ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200' 
                            : 'border-gray-100 bg-white'}`}
                >
                    {/* Index Number */}
                    <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-mono font-medium shrink-0 transition-colors
                        ${selectedSegments.has(seg.id) || activeSegmentId === seg.id
                            ? 'bg-blue-600 text-white' 
                            : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200'}`}
                    >
                        {idx + 1}
                    </div>

                    <div className="flex flex-col flex-1 min-w-0 mr-2">
                        <input 
                            value={seg.speaker}
                            onChange={(e) => handleSpeakerChange(seg.id, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onFocus={() => handleSegmentFocus(seg.id)}
                            className="font-medium text-gray-800 bg-transparent border-none p-0 focus:ring-0 w-full truncate hover:bg-gray-100 rounded px-1 -ml-1 transition-colors"
                            placeholder="说话人"
                        />
                        <input 
                            value={seg.remark || ''}
                            onChange={(e) => handleRemarkChange(seg.id, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onFocus={() => handleSegmentFocus(seg.id)}
                            className="text-xs text-gray-500 bg-transparent border-none p-0 focus:ring-0 w-full truncate hover:bg-gray-100 rounded px-1 -ml-1 transition-colors mt-0.5"
                            placeholder="添加备注..."
                        />
                        <span className="text-xs text-gray-400 font-mono mt-0.5 block">
                            {seg.start.toFixed(2)}s - {seg.end.toFixed(2)}s
                        </span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <span className="text-xs font-bold text-gray-300">
                            {(seg.end - seg.start).toFixed(2)}s
                        </span>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                            <button 
                                onClick={(e) => handlePlaySegment(seg.id, e)}
                                className="p-1 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded"
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
