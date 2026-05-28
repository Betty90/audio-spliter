import React, { useMemo, useState } from 'react';
import { Copy, FileDown, Table as TableIcon, FileJson } from 'lucide-react';
import { AudioFile, LatencyRow } from '../types';
import { formatTime } from '../utils/timeUtils';

interface AnalysisTableProps {
  files: AudioFile[];
  activeSegmentId?: string | null;
  onSegmentSelect?: (id: string | null) => void;
}

const AnalysisTable: React.FC<AnalysisTableProps> = ({ files, activeSegmentId, onSegmentSelect }) => {
  const [copiedFormat, setCopiedFormat] = useState<'markdown' | 'tsv' | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastInteractedId, setLastInteractedId] = useState<string | null>(null);
  const tableRef = React.useRef<HTMLDivElement>(null);

  // Sync selection with activeSegmentId from props
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

  // Scroll to active row
  React.useEffect(() => {
    if (activeSegmentId && tableRef.current) {
        const row = tableRef.current.querySelector(`[data-segment-id*="${activeSegmentId}"]`);
        if (row) {
            row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
  }, [activeSegmentId]);

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
          remark: next.remark || ''
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
              
              // If not holding Ctrl, clear previous selection? 
              // Standard behavior usually keeps existing if Ctrl is held, but Shift usually extends from anchor.
              // Let's assume Shift extends selection (clearing others if Ctrl not held is complex, let's just add range)
              // Actually standard file explorer behavior: Shift+Click selects range from anchor to current, clearing others unless Ctrl is also held.
              // Let's simplify: Shift adds range to current selection or replaces it?
              // Let's replace for simplicity and consistency with "Single Select" base.
              
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
      
      // Always notify parent of the clicked segment (to play/highlight in waveform)
      if (onSegmentSelect) {
          onSegmentSelect(id);
      }
  };

  const selectedStats = useMemo(() => {
      if (selectedIds.size === 0) return null;
      
      const selectedRows = dataRows.filter(r => selectedIds.has(r.segment1Id));
      if (selectedRows.length === 0) return null;

      const totalLatency = selectedRows.reduce((sum, r) => sum + r.latency, 0);
      const avgLatency = totalLatency / selectedRows.length;

      return {
          count: selectedRows.length,
          avg: avgLatency
      };
  }, [selectedIds, dataRows]);

  const fileAverages = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    
    // If selection exists, calculate averages based on selected rows per file
    // Otherwise, calculate based on all rows per file
    const rowsToProcess = selectedIds.size > 0 
        ? dataRows.filter(r => selectedIds.has(r.segment1Id))
        : dataRows;

    rowsToProcess.forEach(row => {
      const current = map.get(row.fileName) || { total: 0, count: 0 };
      // 只计算正向时延? Usually we include all. The previous code had a check `if (row.latency > 0)`.
      // Let's keep that check if it was intended to filter out negative latencies (overlaps).
      if (row.latency > 0) {
          current.total += row.latency;
          current.count += 1;
      }
      map.set(row.fileName, current);
    });
    return map;
  }, [dataRows, selectedIds]);

  const handleSelectAll = () => {
      setSelectedIds(new Set(dataRows.map(r => r.segment1Id)));
  };

  const handleSelectOdd = () => {
      // 选中第 1, 3, 5... 行 (index 0, 2, 4...)
      setSelectedIds(new Set(dataRows.filter((_, i) => i % 2 === 0).map(r => r.segment1Id)));
  };

  const handleSelectEven = () => {
      // 选中第 2, 4, 6... 行 (index 1, 3, 5...)
      setSelectedIds(new Set(dataRows.filter((_, i) => i % 2 !== 0).map(r => r.segment1Id)));
  };

  const copyToClipboard = (format: 'markdown' | 'tsv') => {
    let text = '';
    
    // If selection exists, only copy selected rows. Otherwise copy all.
    const rowsToProcess = selectedIds.size > 0 
        ? dataRows.filter(r => selectedIds.has(r.segment1Id))
        : dataRows;

    // Calculate averages based on the rows to be processed
    const processAverages = new Map<string, { total: number; count: number }>();
    rowsToProcess.forEach(row => {
        const current = processAverages.get(row.fileName) || { total: 0, count: 0 };
        processAverages.set(row.fileName, {
            total: current.total + row.latency,
            count: current.count + 1
        });
    });
    
    if (format === 'markdown') {
        text = `| 播放顺序 | 音色1放音结束 | 音色2放音开始 | 响应时延 | 录音文件 | 平均时延 | 备注 |\n|---|---|---|---|---|---|---|\n`;
        rowsToProcess.forEach((row, idx) => {
             const avg = processAverages.get(row.fileName);
             const isFirstOfFile = idx === 0 || rowsToProcess[idx-1].fileName !== row.fileName;
             
             const avgText = isFirstOfFile && avg && avg.count > 0 
                ? (avg.total / avg.count).toFixed(3) 
                : '';
             text += `| ${row.speakerFrom} -> ${row.speakerTo} | ${row.segment1End.toFixed(2)} | ${row.segment2Start.toFixed(2)} | ${row.latency.toFixed(2)} | ${row.fileName} | ${avgText} | ${row.remark || ''} |\n`;
        });
    } else {
        // Excel 粘贴格式
        text = `播放顺序\t音色1放音结束\t音色2放音开始\t响应时延\t录音文件\t平均时延\t备注\n`;
        rowsToProcess.forEach((row, idx) => {
             const avg = processAverages.get(row.fileName);
             const isFirstOfFile = idx === 0 || rowsToProcess[idx-1].fileName !== row.fileName;
             
             const avgText = isFirstOfFile && avg && avg.count > 0 
                ? (avg.total / avg.count).toFixed(3) 
                : '';
             text += `${row.speakerFrom} -> ${row.speakerTo}\t${row.segment1End.toFixed(2)}\t${row.segment2Start.toFixed(2)}\t${row.latency.toFixed(2)}\t${row.fileName}\t${avgText}\t${row.remark || ''}\n`;
        });
    }

    navigator.clipboard.writeText(text).then(() => {
        setCopiedFormat(format);
        setTimeout(() => setCopiedFormat(null), 2000);
    });
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
        <div className="flex flex-1 flex-col items-center justify-center text-slate-400 bg-white rounded-xl border border-dashed border-slate-300">
            <TableIcon size={42} className="mb-3 opacity-50" />
            <p className="text-sm">处理音频文件后将在此显示分析表格</p>
        </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white shadow-sm rounded-xl overflow-hidden border border-slate-200 min-h-0">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/80 gap-3">
        <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600 shadow-sm">
                <TableIcon size={17} />
            </div>
            <div className="min-w-0">
                <h2 className="text-sm font-bold text-slate-900 leading-tight">响应时延分析</h2>
                <p className="text-xs text-slate-500 leading-tight">{dataRows.length} 行结果 · {files.length} 个文件</p>
            </div>
            {selectedStats && selectedStats.count > 1 && (
                <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 bg-[var(--psbc-green-soft)] text-[var(--psbc-green)] rounded-md text-xs font-semibold border border-[var(--psbc-green-line)]">
                    <span>已选 {selectedStats.count} 项</span>
                    <span className="w-px h-3 bg-[var(--psbc-gold)]"></span>
                    <span>平均时延: {selectedStats.avg.toFixed(3)}s</span>
                </div>
            )}
        </div>
        <div className="flex gap-2 overflow-x-auto shrink-0">
            <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
                <button onClick={handleSelectAll} className="px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded" title="全选">全选</button>
                <div className="w-px h-3 bg-slate-200 mx-1"></div>
                <button onClick={handleSelectOdd} className="px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded" title="选中奇数行">奇数</button>
                <div className="w-px h-3 bg-slate-200 mx-1"></div>
                <button onClick={handleSelectEven} className="px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded" title="选中偶数行">偶数</button>
            </div>
            
            <button 
                onClick={downloadIntermediateJson}
                className="tool-button"
                title="下载中间结果 JSON"
            >
                <FileJson size={14} />
                JSON
            </button>
            <button 
                onClick={() => copyToClipboard('tsv')}
                className="tool-button brand-accent"
            >
                {copiedFormat === 'tsv' ? '已复制' : 'Excel'}
                <FileDown size={14} />
            </button>
            <button 
                onClick={() => copyToClipboard('markdown')}
                className="tool-button border-[var(--psbc-green-line)] text-[var(--psbc-green)] hover:bg-[var(--psbc-green-soft)] hover:border-[var(--psbc-green)]"
            >
                {copiedFormat === 'markdown' ? '已复制' : 'Markdown'}
                <Copy size={14} />
            </button>
        </div>
      </div>
      
      <div className="overflow-auto flex-1" ref={tableRef}>
        <table className="w-full text-left text-[13px] text-slate-600">
            <thead className="bg-white text-slate-600 font-semibold sticky top-0 z-10 shadow-sm border-b border-slate-200">
                <tr>
                    <th className="px-4 py-2.5">播放顺序</th>
                    <th className="px-4 py-2.5">音色1结束</th>
                    <th className="px-4 py-2.5">音色2开始</th>
                    <th className="px-4 py-2.5">响应时延</th>
                    <th className="px-4 py-2.5">录音文件</th>
                    <th className="px-4 py-2.5">平均</th>
                    <th className="px-4 py-2.5">备注</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {dataRows.map((row, idx) => {
                    const avgData = fileAverages.get(row.fileName);
                    const isFirstOfFile = idx === 0 || dataRows[idx-1].fileName !== row.fileName;
                    const avgDisplay = isFirstOfFile && avgData && avgData.count > 0 
                        ? (avgData.total / avgData.count).toFixed(3) 
                        : '';

                    const latencyClass = row.latency > 3.0 ? 'text-red-600 font-medium' : 'text-gray-600';
                    const isSelected = selectedIds.has(row.segment1Id);
                    const isActive = row.segment1Id === activeSegmentId;

                    return (
                        <tr 
                            key={idx} 
                            data-segment-id={`${row.segment1Id},${row.segment2Id}`}
                            onClick={(e) => handleRowClick(row, e)}
                            className={`transition-colors cursor-pointer scroll-mt-12 ${
                                isSelected 
                                    ? 'bg-[var(--psbc-green-soft)] ring-1 ring-inset ring-[var(--psbc-green-line)]' 
                                    : isActive 
                                        ? 'bg-slate-100 ring-1 ring-inset ring-slate-200'
                                        : 'hover:bg-slate-50'
                            }`}
                        >
                            <td className="px-4 py-2.5 text-slate-700 font-semibold">
                                {row.speakerFrom} <span className="text-slate-400 mx-1">→</span> {row.speakerTo}
                            </td>
                            <td className="px-4 py-2.5 font-mono">
                                {formatTime(row.segment1End)} <span className="text-xs text-slate-400">({row.segment1End.toFixed(2)})</span>
                                <div className="text-[11px] text-slate-400">{row.speakerFrom}</div>
                            </td>
                            <td className="px-4 py-2.5 font-mono">
                                {formatTime(row.segment2Start)} <span className="text-xs text-slate-400">({row.segment2Start.toFixed(2)})</span>
                                <div className="text-[11px] text-slate-400">{row.speakerTo}</div>
                            </td>
                            <td className={`px-4 py-2.5 ${latencyClass}`}>
                                {row.latency.toFixed(2)}s
                            </td>
                            <td className="px-4 py-2.5 text-slate-800 font-medium max-w-[220px] truncate" title={row.fileName}>
                                {isFirstOfFile ? row.fileName : ''}
                            </td>
                            <td className="px-4 py-2.5 font-semibold text-slate-800">
                                {avgDisplay}
                            </td>
                            <td className="px-4 py-2.5 text-slate-500 text-xs max-w-[160px] truncate" title={row.remark}>
                                {row.remark}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
      </div>
    </div>
  );
};

export default AnalysisTable;
