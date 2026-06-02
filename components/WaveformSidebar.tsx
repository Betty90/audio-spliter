import React, { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';
import { Play, Pause, SkipBack, SkipForward, ZoomIn, ZoomOut, ChevronsUp, ChevronsDown, Scissors, Save, Trash2, Merge, RefreshCw, Settings, Download, Loader2, X } from 'lucide-react';
import { AppSettings, AudioFile, AudioSegment } from '../types';
import { SPEAKER_COLORS } from '../constants';
import ConfirmDialog, { ConfirmConfig } from './ConfirmDialog';
import { extractAudioSegment } from '../utils/audioUtils';

const DEFAULT_PANEL_WIDTH_RATIO = 0.5;
const MAX_PANEL_WIDTH_RATIO = 0.8;
const MIN_ANALYSIS_CONTENT_WIDTH = 800;
const MIN_PANEL_WIDTH = 360;
const PANEL_WIDTH_FALLBACK = 720;
const SINGLE_CHANNEL_WAVEFORM_HEIGHT = 240;
const SPLIT_CHANNEL_WAVEFORM_HEIGHT = 160;
const MIN_WAVEFORM_HEIGHT_SCALE = 0.7;
const MAX_WAVEFORM_HEIGHT_SCALE = 2;

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
  settings?: AppSettings;
  activeSegmentId?: string | null;
  onSegmentSelect?: (id: string | null) => void;
  onReanalyze?: (fileId: string) => void;
  onOpenSettings?: (fileId: string) => void;
  onOverlayChange?: (isOverlaying: boolean) => void;
}

function normalizeSpeakerKey(speaker: string): string {
  const match = speaker.match(/音色\s*(\d+)/);
  return match ? `音色${match[1]}` : speaker;
}

function speakerNumber(speaker: string): number {
  const match = normalizeSpeakerKey(speaker).match(/音色(\d+)/);
  return match ? Number(match[1]) : 1;
}

function displaySidebarSpeakerName(speaker: string, speakerLabels: Record<string, string>): string {
  return speakerLabels[speaker]?.trim() || speaker;
}

function displaySidebarSpeakerHint(speaker: string, speakerLabels: Record<string, string>): string {
  const normalizedSpeaker = normalizeSpeakerKey(speaker);
  return speakerLabels[normalizedSpeaker]?.trim() ? normalizedSpeaker : '';
}

const WaveformSidebar: React.FC<WaveformSidebarProps> = ({ file, onUpdateSegments, onClose, settings, activeSegmentId, onSegmentSelect, onReanalyze, onOpenSettings, onOverlayChange }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(10);
  const [waveformHeightScale, setWaveformHeightScale] = useState(1);
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
  const isCompactToolRow = effectiveWidth < 460;
  const hideToolLabels = effectiveWidth < 400;
  const playbackButtonClass = 'h-[22px] w-[22px] rounded-md';
  const playButtonClass = 'h-[30px] w-[30px]';
  const playbackIconSize = 13;
  const playIconSize = 13;
  const baseWaveformHeight = channelCount > 1 ? SPLIT_CHANNEL_WAVEFORM_HEIGHT : SINGLE_CHANNEL_WAVEFORM_HEIGHT;
  const waveformHeight = Math.round(baseWaveformHeight * waveformHeightScale);
  const splitChannelGuideTop = waveformHeight + 8;
  const toolButtonClass = hideToolLabels
    ? 'h-8 w-8 flex-none p-0'
    : `h-8 min-w-0 flex-1 ${isCompactToolRow ? 'gap-0.5 px-1 text-[11px] leading-none' : 'px-2 text-xs'}`;
  const toolGroupClass = hideToolLabels
    ? 'ml-auto flex shrink-0 items-center justify-end gap-0.5'
    : `flex min-w-0 flex-1 items-center ${isCompactToolRow ? 'gap-0.5' : 'gap-1.5'}`;

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
  const speakerCount = Math.max(
    1,
    settings?.numSpeakers || 0,
    ...localSegments.map(segment => speakerNumber(segment.speaker)),
    Object.keys(settings?.speakerLabels || {}).length || 0,
    2,
  );
  const speakerOptions = Array.from({ length: speakerCount }, (_, index) => `音色${index + 1}`);
  const speakerLabels = settings?.speakerLabels || {};

  const syncRegionsFromSegments = useCallback((segments: AudioSegment[]) => {
    if (!regionsRef.current) return;
    regionsRef.current.clearRegions();
    segments.forEach((seg) => {
      const normalizedSpeaker = normalizeSpeakerKey(seg.speaker);
      const colorIndex = (speakerNumber(normalizedSpeaker) - 1) % SPEAKER_COLORS.length;
      regionsRef.current!.addRegion({
        id: seg.id,
        start: seg.start,
        end: seg.end,
        content: normalizedSpeaker,
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
    const waveformFileId = file.id;
    const waveformUrl = URL.createObjectURL(file.file);
    wsFileIdRef.current = waveformFileId;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#94a3b8',
      progressColor: '#007a3d',
      cursorColor: '#ef4444',
      sampleRate: 44100,
      height: waveformHeight,
      url: waveformUrl,
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
    wavesurferRef.current = ws;
    regionsRef.current = wsRegions;

    ws.on('ready', () => {
      if (wavesurferRef.current !== ws || wsFileIdRef.current !== waveformFileId) return;

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

    return () => {
      ws.destroy();
      URL.revokeObjectURL(waveformUrl);
      if (wavesurferRef.current === ws) {
        wavesurferRef.current = null;
        regionsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.id, file?.file, file?.blobUrl, channelCount]);

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

  useEffect(() => {
    if (wavesurferRef.current && isReady) {
      wavesurferRef.current.setOptions({ height: waveformHeight });
    }
  }, [waveformHeight, isReady]);

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
          speaker: speakerOptions[0] || '音色1'
      };
      
      const colorIndex = (speakerNumber(newSeg.speaker) - 1) % SPEAKER_COLORS.length;
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
              const normalizedSpeaker = normalizeSpeakerKey(newSpeaker);
              const colorIndex = (speakerNumber(normalizedSpeaker) - 1) % SPEAKER_COLORS.length;
              region.setOptions({ 
                  content: normalizedSpeaker,
                  color: SPEAKER_COLORS[colorIndex]
              });
          }
      }

      const normalizedSpeaker = normalizeSpeakerKey(newSpeaker);
      const nextSegments = localSegments.map(s =>
          s.id === segmentId ? { ...s, speaker: normalizedSpeaker } : s
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
      <div className="z-20 flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <h3 className="max-w-[210px] truncate text-base font-bold leading-tight text-slate-950" title={file.name}>
            {file.name}
          </h3>
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
      <div className="z-10 shrink-0 space-y-2 border-b border-slate-200 bg-white p-3">
         {/* Combined Controls Row */}
         <div className="flex items-center justify-between gap-2">
            
            {/* Playback Controls */}
            <div className="flex shrink-0 items-center gap-0.5">
                <button onClick={() => skip(-10)} disabled={!isReady} className={`flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30 ${playbackButtonClass}`} title="后退10秒"><SkipBack size={playbackIconSize} /></button>
                <button onClick={() => skip(-1)} disabled={!isReady} className={`flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30 ${playbackButtonClass}`} title="后退1秒"><span className="whitespace-nowrap text-[10px] font-bold leading-none">-1</span></button>
                
                <button 
                    onClick={togglePlay} 
                    disabled={!isReady}
                    className={`flex shrink-0 items-center justify-center rounded-full bg-[var(--psbc-green)] text-white shadow-sm transition-transform hover:scale-105 hover:bg-[var(--psbc-green-dark)] disabled:scale-100 disabled:bg-slate-300 ${playButtonClass}`}
                >
                    {isPlaying ? <Pause size={playIconSize} fill="currentColor" /> : <Play size={playIconSize} fill="currentColor" className="ml-0.5" />}
                </button>

                <button onClick={() => skip(1)} disabled={!isReady} className={`flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30 ${playbackButtonClass}`} title="快进1秒"><span className="whitespace-nowrap text-[10px] font-bold leading-none">+1</span></button>
                <button onClick={() => skip(10)} disabled={!isReady} className={`flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30 ${playbackButtonClass}`} title="快进10秒"><SkipForward size={playbackIconSize} /></button>
            </div>

            {/* Tools */}
            <div className={toolGroupClass}>
                <button 
                    onClick={addRegionAtCurrentTime}
                    disabled={!isReady}
                    className={`tool-button whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50 ${toolButtonClass}`}
                    title="添加片段"
                >
                    <Scissors size={14} className="shrink-0" />
                    {!hideToolLabels && <span className="shrink-0 whitespace-nowrap">添加</span>}
                </button>
                <button 
                    onClick={handleMergeSegments}
                    disabled={!isReady || selectedSegments.size < 2}
                    className={`tool-button whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50 ${toolButtonClass}`}
                    title={selectedSegments.size > 1 ? `合并选中片段 (${selectedSegments.size})` : '按住 Ctrl/Cmd 多选，Shift 连选'}
                >
                    <Merge size={14} className="shrink-0" />
                    {!hideToolLabels && <span className="shrink-0 whitespace-nowrap">合并</span>}
                    {!hideToolLabels && selectedSegments.size > 1 && <span className={isCompactToolRow ? 'hidden min-[420px]:inline' : undefined}>({selectedSegments.size})</span>}
                </button>
                <button 
                    onClick={handleDeleteSelected}
                    disabled={!isReady || selectedSegments.size === 0}
                    className={`tool-button whitespace-nowrap text-red-600 hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 ${toolButtonClass}`}
                    title={selectedSegments.size > 0 ? `删除选中片段 (${selectedSegments.size})` : '删除选中片段'}
                >
                    <Trash2 size={14} className="shrink-0" />
                    {!hideToolLabels && <span className="shrink-0 whitespace-nowrap">删除</span>}
                    {!hideToolLabels && selectedSegments.size > 0 && <span className={isCompactToolRow ? 'hidden min-[420px]:inline' : undefined}>({selectedSegments.size})</span>}
                </button>
            </div>
        </div>

        {/* Waveform Container */}
        <div className="group relative rounded-lg border border-slate-200 bg-white p-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-slate-500">
                <span className="font-mono">{currentTime.toFixed(1)}s / {duration.toFixed(1)}s</span>
                <span>{Math.round(zoom)} px/s · {waveformHeight}px</span>
            </div>
            <div ref={containerRef} className="w-full overflow-x-auto" />
            
            {/* Channel Labels - L在上方声道顶部，R在下方声道顶部 */}
            {isReady && channelCount > 1 && (
                <>
                    <span className="absolute left-2 top-2 text-[10px] font-medium text-[var(--psbc-green)] bg-[var(--psbc-green-soft)] px-1.5 py-0.5 rounded z-10 pointer-events-none">L</span>
                    <span className="absolute left-2 text-[10px] font-medium text-amber-600 bg-[var(--psbc-gold-soft)] px-1.5 py-0.5 rounded z-10 pointer-events-none" style={{ top: splitChannelGuideTop }}>R</span>
                    {/* 声道分隔线 - 放在两个声道之间 */}
                    <div className="absolute left-0 right-0 border-t border-dashed border-gray-200 z-10 pointer-events-none" style={{ top: splitChannelGuideTop }} />
                </>
            )}
            
            {/* Loading Overlay */}
            {!isReady && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[var(--psbc-green)]"></div>
                </div>
            )}

            <div className="absolute right-3 top-9 z-20 flex gap-1 rounded-lg border border-slate-200 bg-white/90 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100">
                 <button onClick={() => setZoom(prev => Math.max(10, Math.floor(prev * 0.8)))} className="p-1.5 hover:text-[var(--psbc-green)]" title="横向缩小"><ZoomOut size={16}/></button>
                 <button onClick={() => setZoom(prev => Math.min(1000, Math.ceil(prev * 1.2)))} className="p-1.5 hover:text-[var(--psbc-green)]" title="横向放大"><ZoomIn size={16}/></button>
                 <span className="my-1 w-px bg-slate-200" aria-hidden="true" />
                 <button onClick={() => setWaveformHeightScale(prev => Math.max(MIN_WAVEFORM_HEIGHT_SCALE, Number((prev / 1.2).toFixed(2))))} className="p-1.5 hover:text-[var(--psbc-green)]" title="高度减小"><ChevronsDown size={16}/></button>
                 <button onClick={() => setWaveformHeightScale(prev => Math.min(MAX_WAVEFORM_HEIGHT_SCALE, Number((prev * 1.2).toFixed(2))))} className="p-1.5 hover:text-[var(--psbc-green)]" title="高度增加"><ChevronsUp size={16}/></button>
            </div>
        </div>
      </div>

      {/* Segment List (Scrollable) */}
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto bg-slate-50/60 p-2.5">
            <h4 className="flex items-center justify-between border-b border-slate-100 px-1 pb-1.5 text-xs font-bold text-slate-700">
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
                    className={`group flex cursor-pointer scroll-mt-10 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-sm shadow-[0_1px_1px_rgba(15,23,42,0.03)] transition-all hover:-translate-y-px hover:shadow-sm
                        ${selectedSegments.has(seg.id) || activeSegmentId === seg.id
                            ? 'border-[var(--psbc-green)] bg-[var(--psbc-green-soft)] ring-1 ring-[var(--psbc-green-line)]' 
                            : 'border-slate-100 bg-white hover:border-slate-200'}`}
                >
                    {/* Index Number */}
                    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-mono font-semibold transition-colors
                        ${selectedSegments.has(seg.id) || activeSegmentId === seg.id
                            ? 'bg-[var(--psbc-green)] text-white' 
                            : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'}`}
                    >
                        {idx + 1}
                    </div>

                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                          <select
                            value={normalizeSpeakerKey(seg.speaker)}
                            onChange={(e) => handleSpeakerChange(seg.id, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onFocus={() => handleSegmentFocus(seg.id)}
                            className="h-6 w-[72px] shrink-0 rounded-md border border-transparent bg-transparent px-1 py-0 text-[12px] font-semibold text-slate-800 outline-none transition-colors hover:bg-slate-100 focus:border-[var(--psbc-green-line)] focus:bg-white focus:ring-1 focus:ring-[var(--psbc-green-soft)]"
                            title={displaySidebarSpeakerName(normalizeSpeakerKey(seg.speaker), speakerLabels)}
                          >
                            {speakerOptions.map((speaker) => (
                              <option key={speaker} value={speaker}>
                                {displaySidebarSpeakerName(speaker, speakerLabels)}
                              </option>
                            ))}
                          </select>
                          {displaySidebarSpeakerHint(seg.speaker, speakerLabels) && (
                            <span className="hidden shrink-0 text-[11px] font-medium text-slate-400 min-[460px]:inline">
                              {displaySidebarSpeakerHint(seg.speaker, speakerLabels)}
                            </span>
                          )}
                        <input 
                            value={seg.remark || ''}
                            onChange={(e) => handleRemarkChange(seg.id, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onFocus={() => handleSegmentFocus(seg.id)}
                            className="min-w-0 flex-1 truncate rounded border-none bg-transparent px-1 py-0 text-xs text-slate-500 transition-colors hover:bg-slate-100 focus:ring-0"
                            placeholder={seg.remark || '添加备注'}
                        />
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        <span
                            className="w-[78px] truncate text-right font-mono text-[11px] font-semibold text-slate-400"
                            title={`${seg.start.toFixed(2)}s - ${seg.end.toFixed(2)}s · ${(seg.end - seg.start).toFixed(2)}s`}
                        >
                            {seg.start.toFixed(1)}-{seg.end.toFixed(1)}s
                        </span>
                        <div className="flex h-6 shrink-0 items-center gap-0.5 rounded-md bg-white/70 opacity-100 transition-all sm:opacity-0 sm:group-hover:opacity-100">
                            <button 
                                onClick={(e) => handlePlaySegment(seg.id, e)}
                                className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-[var(--psbc-green-soft)] hover:text-[var(--psbc-green)]"
                                title="播放片段"
                            >
                                <Play size={14} />
                            </button>
                            <button 
                                onClick={(e) => handleDownloadSegment(seg.id, e)}
                                disabled={downloadingId === seg.id}
                                className={`flex h-6 w-6 items-center justify-center rounded ${downloadingId === seg.id ? 'text-green-500' : 'text-gray-400 hover:bg-green-50 hover:text-green-500'}`}
                                title="导出片段"
                            >
                                {downloadingId === seg.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                            </button>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteSegment(seg.id);
                                }}
                                className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-500"
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
