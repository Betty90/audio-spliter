import React from 'react';
import { Upload, ChevronLeft, ChevronRight, FileAudio, Loader2, AlertCircle, RefreshCw, Trash2, Settings } from 'lucide-react';
import { AudioFile, FileStatus } from '../types';
import { ACCEPTED_MIME_TYPES } from '../constants';

interface AudioFileSidebarProps {
  files: AudioFile[];
  selectedFileId: string | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onSelectFile: (fileId: string) => void;
  onUpload: (files: FileList) => void;
  onRetry: (fileId: string) => void;
  onReanalyze: (fileId: string) => void;
  onDelete: (fileId: string) => void;
  onOpenFileSettings: (fileId: string) => void;
  onOpenGlobalSettings: () => void;
  onOpenLab: () => void;
}

const statusColors: Record<FileStatus, string> = {
  [FileStatus.IDLE]: 'bg-slate-300',
  [FileStatus.UPLOADING]: 'bg-blue-400',
  [FileStatus.ANALYZING]: 'bg-amber-400',
  [FileStatus.COMPLETED]: 'bg-emerald-500',
  [FileStatus.ERROR]: 'bg-red-500',
};

const AudioFileSidebar: React.FC<AudioFileSidebarProps> = ({
  files,
  selectedFileId,
  isCollapsed,
  onToggleCollapse,
  onSelectFile,
  onUpload,
  onRetry,
  onReanalyze,
  onDelete,
  onOpenFileSettings,
  onOpenGlobalSettings,
  onOpenLab,
}) => {
  return (
    <aside
      className={`flex flex-col border-r border-slate-200 bg-white shrink-0 transition-all duration-300 ${
        isCollapsed ? 'w-12' : 'w-56'
      }`}
    >
      {/* Header */}
      <div
        className={`flex items-center border-b border-slate-100 px-2 py-2 ${
          isCollapsed ? 'flex-col gap-2' : 'justify-between'
        }`}
      >
        {/* Upload button */}
        <button
          onClick={() => document.getElementById('sidebar-file-upload')?.click()}
          className="flex items-center justify-center w-8 h-8 bg-[var(--psbc-green)] hover:bg-[var(--psbc-green-dark)] text-white rounded-lg cursor-pointer transition-transform active:scale-95 shrink-0"
          title="上传音频文件"
        >
          <Upload size={16} />
          <input
            id="sidebar-file-upload"
            type="file"
            multiple
            accept={Object.values(ACCEPTED_MIME_TYPES).flat().join(',')}
            className="hidden"
            onChange={(e) => {
              if (e.target.files) onUpload(e.target.files);
              e.target.value = '';
            }}
          />
        </button>

        {!isCollapsed && (
          <div className="flex items-center gap-1">
            <button
              onClick={onOpenGlobalSettings}
              className="p-1.5 hover:bg-slate-100 rounded text-slate-500 transition-colors"
              title="分析设置"
            >
              <Settings size={15} />
            </button>
            <button
              onClick={onOpenLab}
              className="p-1.5 hover:bg-slate-100 rounded text-slate-500 transition-colors"
              title="验证实验室"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </button>
            <button
              onClick={onToggleCollapse}
              className="p-1.5 hover:bg-slate-100 rounded text-slate-400 transition-colors"
              title="收起侧栏"
            >
              <ChevronLeft size={15} />
            </button>
          </div>
        )}
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {isCollapsed ? (
          /* Collapsed: show status dots */
          <div className="flex flex-col items-center gap-1.5 py-2">
            {files.map((file) => (
              <button
                key={file.id}
                onClick={() => onSelectFile(file.id)}
                title={`${file.name}${file.error ? ` - ${file.error}` : ''}`}
                className={`w-3 h-3 rounded-full shrink-0 transition-all hover:scale-125 ${
                  statusColors[file.status]
                } ${selectedFileId === file.id ? 'ring-2 ring-[var(--psbc-green)] ring-offset-1' : ''}`}
              />
            ))}
          </div>
        ) : (
          /* Expanded: show file details */
          <div className="flex flex-col">
            {files.map((file) => (
              <div
                key={file.id}
                onClick={() => onSelectFile(file.id)}
                className={`border-b border-slate-50 px-3 py-2.5 cursor-pointer transition-colors ${
                  selectedFileId === file.id
                    ? 'bg-[var(--psbc-green-soft)] border-l-[3px] border-l-[var(--psbc-green)]'
                    : 'border-l-[3px] border-l-transparent hover:bg-slate-50'
                }`}
              >
                {/* File name */}
                <div className="flex items-center gap-1.5 min-w-0">
                  {file.status === FileStatus.ANALYZING ? (
                    <Loader2 size={12} className="animate-spin text-amber-500 shrink-0" />
                  ) : file.status === FileStatus.ERROR ? (
                    <AlertCircle size={12} className="text-red-500 shrink-0" />
                  ) : (
                    <FileAudio size={12} className="text-slate-400 shrink-0" />
                  )}
                  <span className="text-xs font-medium text-slate-700 truncate" title={file.name}>
                    {file.name}
                  </span>
                </div>

                {/* Status & segment count */}
                <div className="flex items-center justify-between mt-1">
                  <span
                    className={`text-[10px] ${
                      file.status === FileStatus.COMPLETED
                        ? 'text-emerald-600'
                        : file.status === FileStatus.ERROR
                        ? 'text-red-500'
                        : file.status === FileStatus.ANALYZING
                        ? 'text-amber-600'
                        : 'text-slate-400'
                    }`}
                  >
                    {file.status === FileStatus.IDLE && '待分析'}
                    {file.status === FileStatus.UPLOADING && '上传中'}
                    {file.status === FileStatus.ANALYZING && '分析中'}
                    {file.status === FileStatus.COMPLETED && `已完成 · ${file.segments.length} 片段`}
                    {file.status === FileStatus.ERROR && (file.error || '分析失败')}
                  </span>
                </div>

                {/* Error message */}
                {file.status === FileStatus.ERROR && file.error && (
                  <p className="text-[10px] text-red-500 mt-0.5 truncate">{file.error}</p>
                )}

                {/* Actions */}
                {(file.status === FileStatus.ERROR || file.status === FileStatus.COMPLETED) && (
                  <div className="flex items-center gap-1 mt-1.5">
                    {file.status === FileStatus.COMPLETED && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenFileSettings(file.id);
                        }}
                        className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
                        title="文件专属配置"
                      >
                        <Settings size={12} />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (file.status === FileStatus.COMPLETED) {
                          onReanalyze(file.id);
                        } else {
                          onRetry(file.id);
                        }
                      }}
                      className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-[var(--psbc-green)] transition-colors"
                      title="重新分析"
                    >
                      <RefreshCw size={12} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(file.id);
                      }}
                      className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors"
                      title="删除文件"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Collapse toggle (bottom, only when collapsed) */}
      {isCollapsed && (
        <button
          onClick={onToggleCollapse}
          className="flex items-center justify-center h-10 border-t border-slate-100 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
          title="展开侧栏"
        >
          <ChevronRight size={16} />
        </button>
      )}
    </aside>
  );
};

export default AudioFileSidebar;
