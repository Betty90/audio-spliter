import React, { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';
import { Play, Pause, SkipBack, SkipForward, ZoomIn, ZoomOut, Scissors, Save, Trash2, Merge, RefreshCw, Settings, Download, Loader2, X } from 'lucide-react';
import { AudioFile, AudioSegment } from '../types';
import { SPEAKER_COLORS } from '../constants';
import ConfirmDialog, { ConfirmConfig } from './ConfirmDialog';
import { extractAudioSegment } from '../utils/audioUtils';

const DEFAULT_PANEL_WIDTH_RATIO = 0.5;
const MAX_PANEL_WIDTH_RATIO = 0.8;
const MIN_ANALYSIS_CONTENT_WIDTH = 800;
const MIN_PANEL_WIDTH = 360;
const PANEL_WIDTH_FALLBACK = 720;

function getDefaultPanelWidth(workspaceWidth?: number): number {
  if (typeof window === 'undefined') return PANEL_WIDTH_FALLBACK;
  const viewportMaxWidth = Math.round(window.innerWidth * MAX_PANEL_WIDTH_RATIO);
  const maxWidth = workspaceWidth ? Math.min(viewportMaxWidth, workspaceWidth) : viewportMaxWidth;
  const availableWidth = workspaceWidth ? workspaceWidth - MIN_ANALYSIS_CONTENT_WIDTH : Math.round(window.innerWidth * DEFAULT_PANEL_WIDTH_RATIO);
  return Math.min(maxWidth, Math.max(MIN_PANEL_WIDTH, availableWidth));
}

interface WaveformSidebarProps {
  file: AudioFile | null;
  onUpdateSegments: (fileId: string, segments: AudioSegment[]) => void;
  onClose: () => void;
  activeSegmentId?: string | null;
  onSegmentSelect?: (id: string | null) => void;
  onReanalyze?: (fileId: string) => void;
  onOpenSettings?: (fileId: string) => void;
  onOverlayChange?: (isOverlaying: boolean) => void;
}

const WaveformSidebar: React.FC<WaveformSidebarProps> = ({ file, onUpdateSegments, onClose, activeSegmentId, onSegmentSelect, onReanalyze, onOpenSettings, onOverlayChange }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(10);
  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [width, setWidth] = useState<number>(() => getDefaultPanelWidth());
  const [workspaceWidth, setWorkspaceWidth] = useState(0);
  const hasMeasuredWorkspaceRef = useRef(false);
  const userResizedRef = useRef(false);
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
      
      const workspace = panelRef.current?.parentElement;
      const workspaceRect = workspace?.getBoundingClientRect();
      const workspaceRight = workspaceRect?.right ?? window.innerWidth;
      const measuredWorkspaceWidth = workspaceRect?.width ?? (workspaceWidth || window.innerWidth);
      const newWidth = workspaceRight - e.clientX;
      const maxWidth = Math.min(measuredWorkspaceWidth, window.innerWidth * MAX_PANEL_WIDTH_RATIO);
      const minWidth = Math.min(MIN_PANEL_WIDTH, maxWidth);
      const clampedWidth = Math.min(maxWidth, Math.max(minWidth, newWidth));

      userResizedRef.current = true;
      setWidth(clampedWidth);
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
  }, [isResizing, workspaceWidth]);

  useEffect(() => {
    const workspace = panelRef.current?.parentElement;
    if (!workspace) return;

    const updateWorkspaceWidth = () => {
      setWorkspaceWidth(workspace.clientWidth);
      if (!hasMeasuredWorkspaceRef.current && !userResizedRef.current) {
        hasMeasuredWorkspaceRef.current = true;
        setWidth(getDefaultPanelWidth(workspace.clientWidth));
      }
    };

    updateWorkspaceWidth();
    const observer = new ResizeObserver(updateWorkspaceWidth);
    observer.observe(workspace);
    window.addEventListener('resize', updateWorkspaceWidth);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateWorkspaceWidth);
    };
  }, []);

  const effectiveWidth = workspaceWidth > 0 ? Math.min(width, workspaceWidth) : width;
  const shouldOverlay = workspaceWidth > 0 && workspaceWidth - effectiveWidth < MIN_ANALYSIS_CONTENT_WIDTH;
  const panelPlacementClass = shouldOverlay ? 'absolute right-0 top-0 bottom-0' : 'relative';

  useEffect(() => {
    if (onOverlayChange) onOverlayChange(shouldOverlay);
    return () => onOverlayChange?.(false);
  }, [onOverlayChange, shouldOverlay]);

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

  const syncRegionsFromSegments = useCallback((segments: AudioSegment[]) => {
    if (!regionsRef.current) return;
    regionsRef.current.clearRegions();
    segments.forEach((seg) => {
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
  }, []);

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

  useEffect(() => {
    if (!isReady || !regionsRef.current) return;
    syncRegionsFromSegments(localSegments);
  }, [isReady, localSegments, syncRegionsFromSegments]);

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
          setIsReady(false);
          setChannelCount(detectedChannels);
          return;
        }
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
      regionsRef.current = null;
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

      const nextSegments = localSegments.map(s =>
          s.id === segmentId ? { ...s, speaker: newSpeaker } : s
      );
      setLocalSegments(nextSegments);
      if (file) onUpdateSegments(file.id, nextSegments);
      setHasUnsavedChanges(true);
  };

  const handleRemarkChange = (segmentId: string, newRemark: string) => {
      const nextSegments = localSegments.map(s =>
          s.id === segmentId ? { ...s, remark: newRemark } : s
      );
      setLocalSegments(nextSegments);
      if (file) onUpdateSegments(file.id, nextSegments);
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
	          <div
	            ref={panelRef}
	            style={{ width: effectiveWidth }}
	            className={`${panelPlacementClass} z-20 flex h-full shrink-0 flex-col items-center justify-center border-l border-slate-200 bg-white p-6 text-center text-slate-400 shadow-[-4px_0_16px_rgba(15,23,42,0.08)]`}
	          >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
                  <Play size={20} />
              </div>
              <p className="text-sm font-semibold text-slate-500">选择文件以查看波形</p>
              <p className="mt-1 text-xs leading-5">分析完成后可在这里播放音频并查看片段。</p>
          </div>
      );
  }

	  return (
	    <div 
	        ref={panelRef}
	        style={{ width: effectiveWidth }}
	        className={`${panelPlacementClass} z-20 flex h-full shrink-0 flex-col border-l border-slate-200 bg-white shadow-[-4px_0_16px_rgba(15,23,42,0.08)] transition-none`}
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
      <div className="z-20 flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4">
        <div className="min-w-0">
          <h3 className="max-w-[210px] truncate text-base font-bold leading-tight text-slate-950" title={file.name}>
            {file.name}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
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
                    className="icon-button"
                    title="使用当前配置重新分析"
                >
                    <RefreshCw size={15} />
                </button>
            )}
            {hasUnsavedChanges && (
                <button 
                    onClick={handleSave}
                    className="flex h-8 items-center gap-1 rounded-lg bg-[var(--psbc-green)] px-2.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--psbc-green-dark)]"
                >
                    <Save size={12} />
                    保存
                </button>
            )}
            <button onClick={onClose} className="icon-button">
                <span className="sr-only">关闭</span>
                <X size={16} />
            </button>
        </div>
      </div>

      {/* Player Section - Fixed/Sticky */}
      <div className="z-10 shrink-0 space-y-3 border-b border-slate-200 bg-white p-3">
         {/* Combined Controls Row */}
         <div className="flex items-center justify-center gap-3">
            
            {/* Playback Controls */}
            <div className="flex items-center gap-3">
                <button onClick={() => skip(-10)} disabled={!isReady} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30" title="后退10秒"><SkipBack size={17} /></button>
                <button onClick={() => skip(-1)} disabled={!isReady} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30" title="后退1秒"><span className="text-xs font-bold">-1</span></button>
                
                <button 
                    onClick={togglePlay} 
                    disabled={!isReady}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--psbc-green)] text-white shadow-sm transition-transform hover:scale-105 hover:bg-[var(--psbc-green-dark)] disabled:scale-100 disabled:bg-slate-300"
                >
                    {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
                </button>

                <button onClick={() => skip(1)} disabled={!isReady} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30" title="快进1秒"><span className="text-xs font-bold">+1</span></button>
                <button onClick={() => skip(10)} disabled={!isReady} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30" title="快进10秒"><SkipForward size={17} /></button>
            </div>
        </div>

            {/* Tools */}
            <div className="grid grid-cols-3 gap-2">
                <button 
                    onClick={addRegionAtCurrentTime}
                    disabled={!isReady}
                    className="tool-button h-8 px-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                    title="添加片段"
                >
                    <Scissors size={14} />
                    添加
                </button>
                <button 
                    onClick={handleMergeSegments}
                    disabled={!isReady || selectedSegments.size < 2}
                    className="tool-button h-8 px-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                    title="按住 Ctrl/Cmd 多选，Shift 连选"
                >
                    <Merge size={14} />
                    合并
                    {selectedSegments.size > 1 && <span>({selectedSegments.size})</span>}
                </button>
                <button 
                    onClick={handleDeleteSelected}
                    disabled={!isReady || selectedSegments.size === 0}
                    className="tool-button h-8 px-2 text-xs text-red-600 hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    title="删除选中片段"
                >
                    <Trash2 size={14} />
                    删除
                    {selectedSegments.size > 0 && <span>({selectedSegments.size})</span>}
                </button>
            </div>

        {/* Waveform Container */}
        <div className="group relative rounded-lg border border-slate-200 bg-white p-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-slate-500">
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
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[var(--psbc-green)]"></div>
                </div>
            )}

            <div className="absolute right-3 top-9 z-20 flex gap-1 rounded-lg border border-slate-200 bg-white/90 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100">
                 <button onClick={() => setZoom(prev => Math.max(10, Math.floor(prev * 0.8)))} className="p-1.5 hover:text-[var(--psbc-green)]" title="缩小"><ZoomOut size={16}/></button>
                 <button onClick={() => setZoom(prev => Math.min(1000, Math.ceil(prev * 1.2)))} className="p-1.5 hover:text-[var(--psbc-green)]" title="放大"><ZoomIn size={16}/></button>
            </div>
        </div>
      </div>

      {/* Segment List (Scrollable) */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50/60 p-3">
            <h4 className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-slate-50/95 py-2 text-xs font-bold text-slate-700 backdrop-blur">
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
                    className={`group flex cursor-pointer scroll-mt-10 items-center gap-3 rounded-lg border p-2.5 text-sm transition-all hover:shadow-sm
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
