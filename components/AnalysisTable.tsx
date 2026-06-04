import React, { useMemo, useState } from 'react';
import { ArrowRight, Copy, FileDown, FileJson, SlidersHorizontal, Table as TableIcon } from 'lucide-react';
import { AudioFile, LatencyRow } from '../types';
import { formatTime } from '../utils/timeUtils';

type AnalysisRowMode = string;

interface AnalysisTableProps {
  files: AudioFile[];
  mode: AnalysisRowMode;
  onModeChange: (mode: AnalysisRowMode) => void;
  activeSegmentId?: string | null;
  onSegmentSelect?: (id: string | null) => void;
  speakerLabels?: Record<string, string>;
}

function normalizeSpeakerKey(speaker: string): string {
  const match = speaker.match(/音色\s*(\d+)/);
  return match ? `音色${match[1]}` : speaker;
}

function displaySpeakerLabel(speaker: string, speakerLabels: Record<string, string> = {}): string {
  const normalized = normalizeSpeakerKey(speaker);
  const mapped = speakerLabels[normalized]?.trim();
  return mapped || normalized;
}

function directionKey(row: LatencyRow): string {
  const { speakerFrom, speakerTo } = row;
  return `${normalizeSpeakerKey(speakerFrom)}->${normalizeSpeakerKey(speakerTo)}`;
}

function filterRowsByMode(rows: LatencyRow[], mode: AnalysisRowMode): LatencyRow[] {
  if (mode === 'all') return rows;
  const matched = rows.filter(row => directionKey(row) === mode);
  return matched.length ? matched : rows;
}

const STACKED_TOOLBAR_WIDTH = 820;
const VERY_COMPACT_TABLE_WIDTH = 560;
const MIN_DIRECTION_BUTTON_WIDTH = 86;

const AnalysisTable: React.FC<AnalysisTableProps> = ({ files, mode, onModeChange, activeSegmentId, onSegmentSelect, speakerLabels = {} }) => {
  const [copiedFormat, setCopiedFormat] = useState<'markdown' | 'tsv' | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastInteractedId, setLastInteractedId] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isLatencySettingsOpen, setIsLatencySettingsOpen] = useState(false);
  const [latencyHighlightThresholds, setLatencyHighlightThresholds] = useState({ low: 1.5, high: 3 });
  const [latencySettingsPosition, setLatencySettingsPosition] = useState<{ top: number; left: number } | null>(null);
  const shellRef = React.useRef<HTMLDivElement>(null);
  const tableRef = React.useRef<HTMLDivElement>(null);
  const latencySettingsButtonRef = React.useRef<HTMLButtonElement>(null);
  const latencySettingsMenuRef = React.useRef<HTMLDivElement>(null);
  const isCompact = containerWidth > 0 && containerWidth < STACKED_TOOLBAR_WIDTH;
  const isVeryCompact = containerWidth > 0 && containerWidth < VERY_COMPACT_TABLE_WIDTH;

  const updateLatencySettingsPosition = React.useCallback(() => {
    const button = latencySettingsButtonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const menuWidth = 224;
    const margin = 8;
    const left = Math.max(margin, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - margin));
    setLatencySettingsPosition({
      top: rect.bottom + margin,
      left,
    });
  }, []);

  React.useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const updateWidth = () => {
      setContainerWidth(shell.getBoundingClientRect().width);
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(shell);

    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (activeSegmentId) {
        setSelectedIds(prev => {
            if (prev.has(activeSegmentId)) {
                return prev;
            } else {
                return new Set([activeSegmentId]);
            }
        });
    }
  }, [activeSegmentId]);

  React.useEffect(() => {
    if (activeSegmentId && tableRef.current) {
        const row = tableRef.current.querySelector(`[data-segment-id*="${activeSegmentId}"]`);
        if (row) {
            row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
  }, [activeSegmentId]);

  React.useEffect(() => {
    if (!isLatencySettingsOpen) return;

    updateLatencySettingsPosition();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (latencySettingsButtonRef.current?.contains(target) || latencySettingsMenuRef.current?.contains(target)) {
        return;
      }
      setIsLatencySettingsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsLatencySettingsOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updateLatencySettingsPosition);
    window.addEventListener('scroll', updateLatencySettingsPosition, true);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updateLatencySettingsPosition);
      window.removeEventListener('scroll', updateLatencySettingsPosition, true);
    };
  }, [isLatencySettingsOpen, updateLatencySettingsPosition]);

  const dataRows: LatencyRow[] = useMemo(() => {
    const rows: LatencyRow[] = [];

    files.forEach(file => {
      const sorted = [...file.segments].sort((a, b) => a.start - b.start);
      
      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const next = sorted[i + 1];

        // 响应时延 = 音色2放音开始 - 音色1放音结束
        const latency = next.start - current.end;
        
        rows.push({
          segment1End: current.end,
          segment2Start: next.start,
          latency: latency,
          fileName: file.name,
          speakerFrom: current.speaker,
          speakerTo: next.speaker,
          segment1Id: current.id,
          segment2Id: next.id,
          segment1Index: i + 1,
          segment2Index: i + 2,
          remark: current.remark || ''
        });
      }
    });
    return rows;
  }, [files]);

  const handleRowClick = (row: LatencyRow, e: React.MouseEvent) => {
      const id = row.segment1Id;
      let newSelected = new Set(selectedIds);

      if (e.ctrlKey || e.metaKey) {
          if (newSelected.has(id)) {
              newSelected.delete(id);
          } else {
              newSelected.add(id);
          }
          setLastInteractedId(id);
      } else if (e.shiftKey && lastInteractedId) {
          const lastIdx = dataRows.findIndex(r => r.segment1Id === lastInteractedId);
          const currIdx = dataRows.findIndex(r => r.segment1Id === id);
          
          if (lastIdx !== -1 && currIdx !== -1) {
              const start = Math.min(lastIdx, currIdx);
              const end = Math.max(lastIdx, currIdx);
              
              newSelected = new Set();
              for (let i = start; i <= end; i++) {
                  newSelected.add(dataRows[i].segment1Id);
              }
          }
      } else {
          newSelected = new Set([id]);
          setLastInteractedId(id);
      }

      setSelectedIds(newSelected);
      
      if (onSegmentSelect) {
          onSegmentSelect(id);
      }
  };

  const displayedRows = useMemo(() => {
    return filterRowsByMode(dataRows, mode);
  }, [dataRows, mode]);

  const latencyExtremes = useMemo(() => {
    const finiteLatencies = displayedRows
      .map(row => row.latency)
      .filter(value => Number.isFinite(value));
    return {
      best: finiteLatencies.length ? Math.min(...finiteLatencies) : null,
      worst: finiteLatencies.length ? Math.max(...finiteLatencies) : null,
    };
  }, [displayedRows]);

  const directionOptions = useMemo(() => {
    const seen = new Set<string>();
    return dataRows.reduce<Array<{ key: string; label: string }>>((options, row) => {
      const key = directionKey(row);
      if (seen.has(key)) return options;
      seen.add(key);
      options.push({
        key,
        label: `${displaySpeakerLabel(row.speakerFrom, speakerLabels)} → ${displaySpeakerLabel(row.speakerTo, speakerLabels)}`,
      });
      return options;
    }, [{ key: 'all', label: '全部' }]);
  }, [dataRows, speakerLabels]);

  const directionGridColumns = useMemo(() => {
    if (directionOptions.length <= 1) return '1fr';
    if (containerWidth === 0) return `repeat(${directionOptions.length}, minmax(0, 1fr))`;

    const availableWidth = Math.max(0, containerWidth - 40);
    const maxColumns = Math.max(2, Math.floor(availableWidth / MIN_DIRECTION_BUTTON_WIDTH));
    const columns = Math.min(directionOptions.length, maxColumns);

    return `repeat(${columns}, minmax(0, 1fr))`;
  }, [containerWidth, directionOptions.length]);

  const copyToClipboard = (format: 'markdown' | 'tsv') => {
    let text = '';
    
    const rowsToProcess = selectedIds.size > 0 
        ? displayedRows.filter(r => selectedIds.has(r.segment1Id))
        : displayedRows;
    
    if (format === 'markdown') {
        text = `| 片段间隔 | 片段1结束 | 片段2开始 | 响应时延 | 备注 |\n|---|---|---|---|---|\n`;
        rowsToProcess.forEach(row => {
             const from = displaySpeakerLabel(row.speakerFrom, speakerLabels);
             const to = displaySpeakerLabel(row.speakerTo, speakerLabels);
             text += `| ${row.segment1Index} ${from} -> ${row.segment2Index} ${to} | ${row.segment1End.toFixed(2)} | ${row.segment2Start.toFixed(2)} | ${row.latency.toFixed(2)} | ${row.remark || '-'} |\n`;
        });
    } else {
        text = `片段间隔\t片段1结束\t片段2开始\t响应时延\t备注\n`;
        rowsToProcess.forEach(row => {
             const from = displaySpeakerLabel(row.speakerFrom, speakerLabels);
             const to = displaySpeakerLabel(row.speakerTo, speakerLabels);
             text += `${row.segment1Index} ${from} -> ${row.segment2Index} ${to}\t${row.segment1End.toFixed(2)}\t${row.segment2Start.toFixed(2)}\t${row.latency.toFixed(2)}\t${row.remark || '-'}\n`;
        });
    }

    navigator.clipboard.writeText(text).then(() => {
        setCopiedFormat(format);
        setTimeout(() => setCopiedFormat(null), 2000);
    });
  };

  const updateLatencyThreshold = (key: 'low' | 'high', value: string) => {
    const parsed = Number(value);
    setLatencyHighlightThresholds(prev => ({
      ...prev,
      [key]: Number.isFinite(parsed) ? Math.max(0, parsed) : 0,
    }));
  };

  // 导出中间文件：[[音色1, 开始, 结束, 时延], ...]
  const downloadIntermediateJson = () => {
      const exportData: any[] = [];
      files.forEach(file => {
          const fileData = file.segments
            .sort((a, b) => a.start - b.start)
            .map((seg, idx, arr) => {
                // 计算时延：当前开始 - 上一段结束。如果是第一段，则无前置时延(0)
                // 注意：这里也可能是指“持续时长”(Duration)，因为示例数据有些歧义
                // 为了保险，我们提供：[音色, 开始, 结束, 与上一段间隔(响应时延)]
                const prevEnd = idx > 0 ? arr[idx-1].end : 0;
                const latency = idx > 0 ? seg.start - prevEnd : 0;
                
                return [
                    seg.speaker,
                    Number(seg.start.toFixed(2)),
                    Number(seg.end.toFixed(2)),
                    Number(latency.toFixed(2)),
                    seg.remark || ''
                ];
            });
          exportData.push({ fileName: file.name, segments: fileData });
      });

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audio_analysis_intermediate_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  if (files.length === 0 || dataRows.length === 0) {
    return (
        <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-slate-400">
            <TableIcon size={42} className="mb-3 opacity-50" />
            <p className="text-sm">当前文件暂无可显示的响应时延</p>
        </div>
    );
  }

  return (
    <div ref={shellRef} className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className={`flex gap-2 border-b border-slate-200 bg-white px-4 py-3 ${isCompact ? 'flex-col items-stretch' : 'items-center justify-between'}`}>
        <div className="min-w-0 flex-1">
            <div
              className="grid max-w-full gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 shadow-sm"
              style={{ gridTemplateColumns: directionGridColumns }}
            >
                {directionOptions.map(option => (
                  <button
                    key={option.key}
                    onClick={() => {
                      setSelectedIds(new Set());
                      onModeChange(option.key);
                    }}
                    className={`min-w-0 cursor-pointer truncate whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-bold ${
                      mode === option.key
                        ? 'bg-[var(--psbc-green-soft)] text-[var(--psbc-green)]'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                    title={option.key === 'all' ? '显示全部响应行' : `只显示 ${option.label}`}
                  >
                    {isVeryCompact && option.key !== 'all' ? option.label.replace(/\s/g, '') : option.label}
                  </button>
                ))}
            </div>
        </div>
        <div className={`flex min-w-0 items-center gap-2 overflow-x-auto ${isCompact ? 'justify-end' : 'shrink-0'}`}>
            <button 
                onClick={downloadIntermediateJson}
                className="tool-button h-9 shrink-0 px-3"
                title="下载中间结果 JSON"
            >
                <FileJson size={14} />
                {isCompact ? 'JSON' : '导出 JSON'}
            </button>
            <button 
                onClick={() => copyToClipboard('tsv')}
                className="tool-button brand-accent h-9 shrink-0 px-3"
            >
                {copiedFormat === 'tsv' ? '已复制' : isCompact ? 'Excel' : '导出 Excel'}
                <FileDown size={14} />
            </button>
            <button 
                onClick={() => copyToClipboard('markdown')}
                className="tool-button h-9 shrink-0 border-[var(--psbc-green-line)] px-3 text-[var(--psbc-green)] hover:border-[var(--psbc-green)] hover:bg-[var(--psbc-green-soft)]"
            >
                {copiedFormat === 'markdown' ? '已复制' : isCompact ? 'Markdown' : '导出 Markdown'}
                <Copy size={14} />
            </button>
            <div className="relative shrink-0">
              <button
                ref={latencySettingsButtonRef}
                type="button"
                onClick={() => {
                  if (!isLatencySettingsOpen) {
                    updateLatencySettingsPosition();
                  }
                  setIsLatencySettingsOpen(prev => !prev);
                }}
                className={`tool-button h-9 w-9 px-0 ${isLatencySettingsOpen ? 'border-[var(--psbc-green)] bg-[var(--psbc-green-soft)] text-[var(--psbc-green)]' : ''}`}
                title="设置时延高亮阈值"
                aria-label="设置时延高亮阈值"
                aria-expanded={isLatencySettingsOpen}
              >
                <SlidersHorizontal size={18} strokeWidth={2.2} />
              </button>
            </div>
        </div>
      </div>

      {isLatencySettingsOpen && latencySettingsPosition && (
        <div
          ref={latencySettingsMenuRef}
          className="fixed z-50 w-56 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-xl"
          style={{ top: latencySettingsPosition.top, left: latencySettingsPosition.left }}
        >
          <div className="mb-3 font-bold text-slate-700">时延高亮</div>
          <label className="mb-2 flex items-center justify-between gap-3 text-slate-600">
            <span className="shrink-0">低于</span>
            <div className="flex min-w-0 items-center gap-1">
              <input
                type="number"
                min="0"
                step="0.1"
                value={latencyHighlightThresholds.low}
                onChange={(event) => updateLatencyThreshold('low', event.currentTarget.value)}
                className="h-8 w-20 rounded-md border border-slate-200 px-2 font-mono text-slate-800 outline-none focus:border-[var(--psbc-green)] focus:ring-2 focus:ring-[var(--psbc-green-line)]"
              />
              <span className="text-slate-400">s</span>
            </div>
          </label>
          <label className="flex items-center justify-between gap-3 text-slate-600">
            <span className="shrink-0">高于</span>
            <div className="flex min-w-0 items-center gap-1">
              <input
                type="number"
                min="0"
                step="0.1"
                value={latencyHighlightThresholds.high}
                onChange={(event) => updateLatencyThreshold('high', event.currentTarget.value)}
                className="h-8 w-20 rounded-md border border-slate-200 px-2 font-mono text-slate-800 outline-none focus:border-[var(--psbc-green)] focus:ring-2 focus:ring-[var(--psbc-green-line)]"
              />
              <span className="text-slate-400">s</span>
            </div>
          </label>
          <div className="mt-3 border-t border-slate-100 pt-2 text-[11px] leading-4 text-slate-500">
            最高和最低时延会始终优先高亮。
          </div>
        </div>
      )}
      
      <div className="flex-1 overflow-auto" ref={tableRef}>
	        <table className={`w-full table-fixed text-left text-[13px] text-slate-600 ${isVeryCompact ? 'min-w-[520px]' : isCompact ? 'min-w-[600px]' : 'min-w-[760px]'}`}>
	            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-white text-xs font-bold text-slate-600 shadow-[0_1px_0_rgba(15,23,42,0.04)]">
	                <tr>
	                    <th className={`${isVeryCompact ? 'w-[142px]' : isCompact ? 'w-[160px]' : 'w-[180px]'} px-2.5 py-2.5`}>片段间隔</th>
	                    <th className={`${isCompact ? 'w-[105px]' : 'w-[145px]'} px-2.5 py-2.5`}>片段1结束</th>
	                    <th className={`${isCompact ? 'w-[105px]' : 'w-[145px]'} px-2.5 py-2.5`}>片段2开始</th>
	                    <th className={`${isCompact ? 'w-[84px]' : 'w-[95px]'} px-2.5 py-2.5`}>响应时延</th>
	                    <th className={`${isCompact ? 'w-[64px]' : 'w-[80px]'} px-2.5 py-2.5`}>备注</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {displayedRows.map((row, idx) => {
                    const isBestLatency = latencyExtremes.best !== null && row.latency === latencyExtremes.best;
                    const isWorstLatency = latencyExtremes.worst !== null && row.latency === latencyExtremes.worst && latencyExtremes.worst !== latencyExtremes.best;
                    const isLowThresholdLatency = row.latency < latencyHighlightThresholds.low;
                    const isHighThresholdLatency = row.latency > latencyHighlightThresholds.high;
                    const latencyClass = isBestLatency
                        ? 'text-emerald-700 font-bold'
                        : isWorstLatency
                            ? 'text-red-700 font-extrabold'
                            : isHighThresholdLatency
                                ? 'text-red-600 font-bold'
                                : isLowThresholdLatency
                                    ? 'text-sky-700 font-bold'
                                : 'text-gray-600';
                    const isSelected = selectedIds.has(row.segment1Id);
                    const isActive = row.segment1Id === activeSegmentId;
                    const fromLabel = displaySpeakerLabel(row.speakerFrom, speakerLabels);
                    const toLabel = displaySpeakerLabel(row.speakerTo, speakerLabels);

                    return (
                        <tr 
                            key={idx} 
                            data-segment-id={`${row.segment1Id},${row.segment2Id}`}
                            onClick={(e) => handleRowClick(row, e)}
                            className={`cursor-pointer scroll-mt-12 transition-colors ${
                                isSelected 
                                    ? 'bg-[var(--psbc-green-soft)] ring-1 ring-inset ring-[var(--psbc-green-line)]' 
                                    : isActive 
                                        ? 'bg-slate-100 ring-1 ring-inset ring-slate-200'
                                        : 'hover:bg-slate-50'
                            }`}
                        >
	                            <td className="px-2.5 py-2.5 font-semibold text-slate-700">
	                                <div className="flex min-w-0 items-center gap-1.5">
                                        <span className={`flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md px-1 text-[11px] font-bold ${isSelected ? 'bg-[var(--psbc-green)] text-white' : 'bg-slate-100 text-slate-600'}`}>
                                            {row.segment1Index}
                                        </span>
                                        <span className="min-w-0 truncate">
                                            {fromLabel}
                                        </span>
                                        <ArrowRight size={12} className="shrink-0 text-slate-400" />
                                        <span className={`flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md px-1 text-[11px] font-bold ${isSelected ? 'bg-[var(--psbc-green)] text-white' : 'bg-slate-100 text-slate-600'}`}>
                                            {row.segment2Index}
                                        </span>
                                        <span className="min-w-0 truncate">
                                            {toLabel}
                                        </span>
	                                </div>
	                            </td>
	                            <td className="px-2.5 py-2.5 font-mono text-slate-700">
                                {formatTime(row.segment1End)} {!isCompact && <span className="text-xs text-slate-400">({row.segment1End.toFixed(2)})</span>}
                            </td>
                            <td className="px-2.5 py-2.5 font-mono text-slate-700">
                                {formatTime(row.segment2Start)} {!isCompact && <span className="text-xs text-slate-400">({row.segment2Start.toFixed(2)})</span>}
                            </td>
                            <td className={`px-2.5 py-2.5 font-semibold ${latencyClass}`}>
                                {row.latency.toFixed(2)}s
                            </td>
                            <td className="w-[80px] px-2.5 py-2.5 text-slate-600">
                                <span className={`block truncate ${row.remark ? '' : 'text-slate-400'}`} title={row.remark || '-'}>
                                    {row.remark || '-'}
                                </span>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
      </div>
      <div className="flex h-10 shrink-0 items-center justify-between border-t border-slate-200 bg-white px-4 text-xs font-medium text-slate-500">
        <span>共 {displayedRows.length} 条</span>
        <span>点击行可联动右侧波形片段</span>
      </div>
    </div>
  );
};

export default AnalysisTable;
