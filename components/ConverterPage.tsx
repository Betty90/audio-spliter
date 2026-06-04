import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Download,
  FileAudio,
  Folder,
  Loader2,
  RefreshCw,
  Settings2,
  Trash2,
} from 'lucide-react';
import { AudioFile, ConversionSettings, OutputPolicy } from '../types';
import { convertAudio } from '../services/apiService';

interface ConverterPageProps {
  onBack: () => void;
  pendingFile?: (AudioFile & { requestId: string }) | null;
  outputPolicy: OutputPolicy;
  conversionSettings: ConversionSettings;
  onOutputPolicyChange: (policy: OutputPolicy) => void;
  onConversionSettingsChange: (settings: ConversionSettings) => void;
}

interface QueueItem {
  id: string;
  sourceId: string;
  file: File;
  sourceFormat: string;
  durationLabel: string;
  status: 'idle' | 'converting' | 'success' | 'error';
  convertedUrl?: string;
  outputPath?: string;
  error?: string;
  progress?: number;
}

const formatOptions: ConversionSettings['targetFormat'][] = ['m4a', 'mp3', 'wav', 'aac', 'ogg', 'flac'];

const audioFormatPresets: Record<string, Pick<ConversionSettings, 'audioCodec' | 'sampleRate' | 'channels' | 'audioBitrate'>> = {
  m4a: { audioCodec: 'aac', sampleRate: '48000', channels: 'stereo', audioBitrate: '192' },
  mp3: { audioCodec: 'mp3', sampleRate: '44100', channels: 'stereo', audioBitrate: '192' },
  wav: { audioCodec: 'wav', sampleRate: '48000', channels: 'stereo', audioBitrate: 'source' },
  aac: { audioCodec: 'aac', sampleRate: '48000', channels: 'stereo', audioBitrate: '192' },
  ogg: { audioCodec: 'opus', sampleRate: '48000', channels: 'stereo', audioBitrate: '128' },
  flac: { audioCodec: 'flac', sampleRate: '48000', channels: 'stereo', audioBitrate: 'source' },
};

const selectClass = 'h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-[var(--psbc-green)] focus:ring-2 focus:ring-[var(--psbc-green-soft)]';

function makeId(): string {
  return `queue-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

function extensionOf(name: string): string {
  return name.split('.').pop()?.toUpperCase() || 'FILE';
}

function buildOutputName(item: QueueItem, policy: OutputPolicy, targetFormat: string): string {
  const stem = baseName(item.file.name);
  if (policy.naming === 'prefix') return `converted_${stem}.${targetFormat}`;
  if (policy.naming === 'suffix') return `${stem}_converted.${targetFormat}`;
  return `${stem}.${targetFormat}`;
}

const ConverterPage: React.FC<ConverterPageProps> = ({
  pendingFile,
  outputPolicy,
  conversionSettings,
  onOutputPolicyChange,
  onConversionSettingsChange,
}) => {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isConverting, setIsConverting] = useState(false);

  const targetFormat = formatOptions.includes(conversionSettings.targetFormat) ? conversionSettings.targetFormat : 'm4a';

  const metrics = useMemo(() => {
    const success = queue.filter(item => item.status === 'success').length;
    const failed = queue.filter(item => item.status === 'error').length;
    const waiting = queue.filter(item => item.status === 'idle').length;
    const size = queue.reduce((sum, item) => sum + item.file.size, 0);
    return { success, failed, waiting, size };
  }, [queue]);

  const addAudioFilesToQueue = (audioFiles: AudioFile[]) => {
    setQueue(prev => {
      const newItems = audioFiles
      .filter(audioFile => !prev.some(item => item.sourceId === audioFile.id))
      .map(audioFile => ({
        id: makeId(),
        sourceId: audioFile.id,
        file: audioFile.file,
        sourceFormat: extensionOf(audioFile.name),
        durationLabel: '--:--',
        status: 'idle' as const,
      }));
      return [...prev, ...newItems];
    });
  };

  useEffect(() => {
    if (pendingFile) {
      addAudioFilesToQueue([pendingFile]);
    }
  }, [pendingFile?.requestId]);

  const updateQueueItem = (id: string, patch: Partial<QueueItem>) => {
    setQueue(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item));
  };

  const convertItem = async (item: QueueItem) => {
    updateQueueItem(item.id, { status: 'converting', error: undefined, progress: 48 });

    try {
      const blob = await convertAudio(item.file, targetFormat, conversionSettings);
      const outputName = buildOutputName(item, outputPolicy, targetFormat);

      if (window.electron?.saveFile && outputPolicy.directory) {
        const data = Array.from(new Uint8Array(await blob.arrayBuffer()));
        const saved = await window.electron.saveFile({
          directory: outputPolicy.directory,
          fileName: outputName,
          data,
          existingFile: outputPolicy.existingFile,
        });
        updateQueueItem(item.id, { status: 'success', outputPath: saved.path, progress: 100 });
        if (outputPolicy.afterConversion === 'reveal') {
          await window.electron.revealInFinder(saved.path);
        }
      } else {
        const url = URL.createObjectURL(blob);
        updateQueueItem(item.id, { status: 'success', convertedUrl: url, progress: 100 });
      }
    } catch (err: any) {
      updateQueueItem(item.id, { status: 'error', error: err.message || '转换过程中发生错误', progress: 0 });
    }
  };

  const handleConvertAll = async () => {
    setIsConverting(true);
    const itemsToConvert = queue.filter(item => item.status === 'idle' || item.status === 'error');
    for (const item of itemsToConvert) {
      await convertItem(item);
    }
    setIsConverting(false);
  };

  const handleDownloadAll = async () => {
    const firstSaved = queue.find(item => item.outputPath);
    if (firstSaved?.outputPath && window.electron?.revealInFinder) {
      await window.electron.revealInFinder(firstSaved.outputPath);
      return;
    }
    const firstUrl = queue.find(item => item.convertedUrl);
    if (firstUrl?.convertedUrl) {
      const link = document.createElement('a');
      link.href = firstUrl.convertedUrl;
      link.download = buildOutputName(firstUrl, outputPolicy, targetFormat);
      link.click();
    }
  };

  const chooseOutputDirectory = async () => {
    if (!window.electron?.selectOutputDirectory) return;
    const directory = await window.electron.selectOutputDirectory();
    if (directory) onOutputPolicyChange({ ...outputPolicy, directory });
  };

  const applyTargetFormat = (format: ConversionSettings['targetFormat']) => {
    onConversionSettingsChange({
      ...conversionSettings,
      targetFormat: format,
      ...audioFormatPresets[format],
    });
  };

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_284px] gap-3 overflow-hidden p-4">
      <div className="flex min-w-0 flex-col gap-3 overflow-hidden">
        <div className="grid grid-cols-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {[
            ['待转换', metrics.waiting, '个文件'],
            ['已完成', metrics.success, '个文件'],
            ['失败', metrics.failed, '个文件'],
            ['预计总大小', formatBytes(metrics.size), '估算'],
          ].map(([label, value, hint], index) => (
            <div key={label} className={`px-4 py-3 ${index > 0 ? 'border-l border-slate-200' : ''}`}>
              <div className="text-xs font-bold text-slate-500">{label}</div>
              <div className="mt-1 text-xl font-bold text-slate-950">{value}</div>
              <div className="mt-1 text-xs text-slate-500">{hint}</div>
            </div>
          ))}
        </div>

        <div
          data-testid="converter-output-toolbar"
          className="flex min-w-0 items-end gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
        >
          <Field label="输出文件夹" className="min-w-[180px] flex-[1.4]">
            <div className="flex gap-1.5">
              <input className={selectClass} value={outputPolicy.directory || 'Downloads'} readOnly />
              <button onClick={chooseOutputDirectory} className="icon-button h-8 w-8 shrink-0 border border-slate-200" title="选择目录">
                <Folder size={15} />
              </button>
            </div>
          </Field>
          <Field label="文件命名" className="min-w-[130px] flex-1">
            <select className={selectClass} value={outputPolicy.naming} onChange={e => onOutputPolicyChange({ ...outputPolicy, naming: e.target.value as OutputPolicy['naming'] })}>
              <option value="preserve">保留原名</option>
              <option value="prefix">converted_ 前缀</option>
              <option value="suffix">_converted 后缀</option>
            </select>
          </Field>
          <Field label="已存在文件" className="min-w-[120px] flex-1">
            <select className={selectClass} value={outputPolicy.existingFile} onChange={e => onOutputPolicyChange({ ...outputPolicy, existingFile: e.target.value as OutputPolicy['existingFile'] })}>
              <option value="auto-rename">自动重命名</option>
              <option value="overwrite">覆盖</option>
            </select>
          </Field>
          <Field label="完成后" className="min-w-[120px] flex-1">
            <select className={selectClass} value={outputPolicy.afterConversion} onChange={e => onOutputPolicyChange({ ...outputPolicy, afterConversion: e.target.value as OutputPolicy['afterConversion'] })}>
              <option value="none">无操作</option>
              <option value="reveal">显示文件夹</option>
            </select>
          </Field>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] overflow-hidden">
          <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <RefreshCw size={17} className={isConverting ? 'animate-spin text-[var(--psbc-green)]' : ''} />
                转换队列 ({queue.length})
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setQueue([])} className="tool-button" disabled={queue.length === 0}>
                  <Trash2 size={15} />
                  清空列表
                </button>
                <button onClick={handleDownloadAll} className="tool-button" disabled={!queue.some(item => item.status === 'success')}>
                  <Archive size={15} />
                  查看输出
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-500">
                  <tr>
                    <th className="w-9 px-3 py-2.5"><input type="checkbox" /></th>
                    <th className="px-3 py-2.5">文件名</th>
                    <th className="px-3 py-2.5">源格式</th>
                    <th className="px-3 py-2.5">大小</th>
                    <th className="px-3 py-2.5">目标格式</th>
                    <th className="px-3 py-2.5">状态</th>
                    <th className="px-3 py-2.5 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {queue.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="h-64 text-center text-slate-400">请从左侧添加文件开始转换</td>
                    </tr>
                  ) : queue.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2"><input type="checkbox" /></td>
                      <td className="max-w-[280px] px-3 py-2">
                        <div className="flex items-center gap-2">
                          <FileAudio size={17} className="text-slate-500" />
                          <span className="truncate font-semibold text-slate-800" title={item.file.name}>{item.file.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{item.sourceFormat}</td>
                      <td className="px-3 py-2 text-slate-600">{formatBytes(item.file.size)}</td>
                      <td className="px-3 py-2">
                        <select
                          value={targetFormat}
                          onChange={(event) => applyTargetFormat(event.target.value as ConversionSettings['targetFormat'])}
                          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700"
                        >
                          {formatOptions.map(format => <option key={format} value={format}>{format.toUpperCase()}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        {item.status === 'converting' && (
                          <span className="flex items-center gap-2 text-xs font-bold text-[var(--psbc-green)]">
                            <Loader2 size={14} className="animate-spin" /> 转换中 {item.progress || 0}%
                          </span>
                        )}
                        {item.status === 'success' && <span className="flex items-center gap-2 text-xs font-bold text-emerald-600"><CheckCircle2 size={14} /> 已完成</span>}
                        {item.status === 'error' && <span className="flex max-w-[180px] items-center gap-2 truncate text-xs font-bold text-red-600"><AlertCircle size={14} /> {item.error}</span>}
                        {item.status === 'idle' && <span className="text-xs font-bold text-slate-500">准备就绪</span>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-2">
                          {item.convertedUrl && (
                            <a href={item.convertedUrl} download={buildOutputName(item, outputPolicy, targetFormat)} className="icon-button" title="下载">
                              <Download size={16} />
                            </a>
                          )}
                          {item.status === 'success' && item.outputPath && window.electron?.revealInFinder && (
                            <button onClick={() => window.electron?.revealInFinder(item.outputPath!)} className="icon-button" title="在文件夹中显示">
                              <Folder size={16} />
                            </button>
                          )}
                          <button onClick={() => setQueue(prev => prev.filter(next => next.id !== item.id))} className="icon-button" title="移除">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-3 py-2.5">
              <div className="text-xs text-slate-500">共 {queue.length} 条 · 并发任务数 2</div>
              <button
                onClick={handleConvertAll}
                disabled={isConverting || queue.length === 0 || queue.every(item => item.status === 'success')}
                className="flex h-10 items-center gap-2 rounded-lg bg-[var(--psbc-green)] px-6 text-sm font-bold text-white shadow-sm hover:bg-[var(--psbc-green-dark)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isConverting ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
                {isConverting ? '转换中...' : '开始转换'}
              </button>
            </div>
          </section>
        </div>
      </div>

      <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Settings2 size={17} />
            音频设置
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="mb-4">
            <div className="mb-2 text-xs font-bold text-slate-600">输出格式</div>
            <div className="grid grid-cols-3 gap-1.5">
              {formatOptions.map(format => (
                <button
                  key={format}
                  onClick={() => applyTargetFormat(format)}
                  className={`relative h-8 rounded-md border text-xs font-bold ${
                    targetFormat === format
                      ? 'border-[var(--psbc-green)] bg-[var(--psbc-green-soft)] text-[var(--psbc-green)]'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {format.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <SettingsGroup title="音频设置">
            <Field label="音频编码">
              <select className={selectClass} value={conversionSettings.audioCodec} onChange={e => onConversionSettingsChange({ ...conversionSettings, audioCodec: e.target.value as ConversionSettings['audioCodec'] })}>
                <option value="aac">AAC</option>
                <option value="mp3">MP3</option>
                <option value="wav">WAV PCM</option>
                <option value="opus">Opus</option>
                <option value="flac">FLAC</option>
                <option value="source">与源文件一致</option>
              </select>
            </Field>
            <Field label="采样率">
              <select className={selectClass} value={conversionSettings.sampleRate} onChange={e => onConversionSettingsChange({ ...conversionSettings, sampleRate: e.target.value as ConversionSettings['sampleRate'] })}>
                <option value="48000">48 kHz</option>
                <option value="44100">44.1 kHz</option>
                <option value="22050">22.05 kHz</option>
                <option value="16000">16 kHz</option>
                <option value="source">与源文件一致</option>
              </select>
            </Field>
            <Field label="声道">
              <select className={selectClass} value={conversionSettings.channels} onChange={e => onConversionSettingsChange({ ...conversionSettings, channels: e.target.value as ConversionSettings['channels'] })}>
                <option value="stereo">立体声</option>
                <option value="mono">单声道</option>
                <option value="left">仅左声道</option>
                <option value="right">仅右声道</option>
                <option value="source">与源文件一致</option>
              </select>
            </Field>
            <Field label="音频码率">
              <select className={selectClass} value={conversionSettings.audioBitrate} onChange={e => onConversionSettingsChange({ ...conversionSettings, audioBitrate: e.target.value as ConversionSettings['audioBitrate'] })}>
                <option value="96">96 kbps</option>
                <option value="128">128 kbps</option>
                <option value="192">192 kbps（推荐）</option>
                <option value="256">256 kbps</option>
                <option value="320">320 kbps</option>
                <option value="source">与源文件一致</option>
              </select>
            </Field>
          </SettingsGroup>
        </div>

      </aside>
    </div>
  );
};

const SettingsGroup: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mb-4">
    <h3 className="mb-2 text-xs font-bold text-slate-700">{title}</h3>
    <div className="space-y-2.5">{children}</div>
  </section>
);

const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className = '' }) => (
  <label className={`block ${className}`}>
    <span className="mb-1 block text-[11px] font-semibold text-slate-500">{label}</span>
    {children}
  </label>
);

export default ConverterPage;
