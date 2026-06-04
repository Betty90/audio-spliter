import React, { useEffect, useState } from 'react';
import {
  Archive,
  ChevronRight,
  Check,
  Clock3,
  FileAudio,
  Folder,
  Layers,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Repeat,
  RotateCcw,
  Settings,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { AudioFile, FileStatus, LibraryCategory, LibraryCollection, LibraryItem, WorkspaceTab } from '../types';
import { ACCEPTED_MIME_TYPES } from '../constants';

interface AudioFileSidebarProps {
  files: AudioFile[];
  libraryItems: LibraryItem[];
  selectedFileId: string | null;
  activeTab: WorkspaceTab;
  activeCategory: LibraryCategory;
  activeCollectionId: string | null;
  collections: LibraryCollection[];
  onChangeTab: (tab: WorkspaceTab) => void;
  onChangeCategory: (category: LibraryCategory) => void;
  onChangeCollection: (collectionId: string) => void;
  onSelectFile: (fileId: string) => void;
  onSelectLibraryItem: (itemId: string) => void;
  onUpload: (files: FileList) => void;
  onBrowseFiles: () => void;
  onCreateLibrary: (name: string) => void;
  onDeleteLibrary: (collectionId: string) => void;
  onMoveToLibrary: (fileId: string, collectionId: string | null) => void;
  onRetry: (fileId: string) => void;
  onReanalyze: (fileId: string) => void;
  onDelete: (fileId: string) => void;
  onRestore: (fileId: string) => void;
  onPermanentDelete: (fileId: string) => void;
  onToggleFavorite: (fileId: string) => void;
  onOpenFileSettings: (fileId: string) => void;
  onOpenGlobalSettings: () => void;
}

const statusLabel: Record<FileStatus, string> = {
  [FileStatus.IDLE]: '待分析',
  [FileStatus.UPLOADING]: '上传中',
  [FileStatus.ANALYZING]: '分析中',
  [FileStatus.COMPLETED]: '已分析',
  [FileStatus.ERROR]: '失败',
};

const navItems: Array<{ id: WorkspaceTab; label: string; icon: React.ElementType }> = [
  { id: 'analyzer', label: '分析', icon: Layers },
  { id: 'converter', label: '转换', icon: Repeat },
];

const categoryItems: Array<{ id: LibraryCategory; label: string; icon: React.ElementType }> = [
  { id: 'all', label: '全部文件', icon: Archive },
  { id: 'recent', label: '最近分析', icon: Clock3 },
  { id: 'favorites', label: '收藏夹', icon: Star },
  { id: 'trash', label: '回收站', icon: Trash2 },
];

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '--';
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

const AudioFileSidebar: React.FC<AudioFileSidebarProps> = ({
  files,
  libraryItems,
  selectedFileId,
  activeTab,
  activeCategory,
  activeCollectionId,
  collections,
  onChangeTab,
  onChangeCategory,
  onChangeCollection,
  onSelectFile,
  onSelectLibraryItem,
  onUpload,
  onBrowseFiles,
  onCreateLibrary,
  onDeleteLibrary,
  onMoveToLibrary,
  onRetry,
  onReanalyze,
  onDelete,
  onRestore,
  onPermanentDelete,
  onToggleFavorite,
  onOpenFileSettings,
  onOpenGlobalSettings,
}) => {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isCreatingLibrary, setIsCreatingLibrary] = useState(false);
  const [isCustomLibrariesCollapsed, setIsCustomLibrariesCollapsed] = useState(false);
  const [newLibraryName, setNewLibraryName] = useState('');
  const liveIds = new Set(files.map(file => file.id));
  const mergedItems = [
    ...files.map(file => ({
      id: file.id,
      name: file.name,
      size: file.size || file.file.size,
      duration: file.duration,
      status: file.status,
      segmentCount: file.segments.length,
      isFavorite: !!file.isFavorite,
      isDeleted: !!file.isDeleted,
      collectionIds: file.collectionIds || [],
      updatedAt: file.updatedAt || Date.now(),
      lastAnalyzedAt: file.lastAnalyzedAt,
      error: file.error,
    })),
    ...libraryItems
      .filter(item => !liveIds.has(item.id))
      .map(item => ({
        id: item.id,
        name: item.name,
        size: item.size,
        duration: item.duration,
        status: item.status === 'error' ? FileStatus.ERROR : item.status === 'analyzed' ? FileStatus.COMPLETED : FileStatus.IDLE,
        segmentCount: item.segmentCount,
        isFavorite: item.isFavorite,
        isDeleted: item.isDeleted,
        collectionIds: item.collectionIds || [],
        updatedAt: item.updatedAt,
        lastAnalyzedAt: item.lastAnalyzedAt,
        error: item.error,
      })),
  ];

  const filteredItems = mergedItems
    .filter(item => {
      if (activeCollectionId) return !item.isDeleted && item.collectionIds.includes(activeCollectionId);
      if (activeCategory === 'trash') return item.isDeleted;
      if (item.isDeleted) return false;
      if (activeCategory === 'recent') return item.status === FileStatus.COMPLETED || !!item.lastAnalyzedAt;
      if (activeCategory === 'favorites') return item.isFavorite;
      return true;
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const categoryCounts: Record<LibraryCategory, number> = {
    all: mergedItems.filter(item => !item.isDeleted).length,
    recent: mergedItems.filter(item => !item.isDeleted && item.status === FileStatus.COMPLETED).length,
    favorites: mergedItems.filter(item => !item.isDeleted && item.isFavorite).length,
    trash: mergedItems.filter(item => item.isDeleted).length,
  };

  const collectionCounts = new Map(collections.map(collection => [
    collection.id,
    mergedItems.filter(item => !item.isDeleted && item.collectionIds.includes(collection.id)).length,
  ]));

  const submitLibrary = () => {
    const trimmed = newLibraryName.trim();
    if (!trimmed) return;
    onCreateLibrary(trimmed);
    setNewLibraryName('');
    setIsCreatingLibrary(false);
  };

  const cancelLibrary = () => {
    setNewLibraryName('');
    setIsCreatingLibrary(false);
  };

  useEffect(() => {
    if (!openMenuId) return;

    const handleDocumentMouseDown = () => setOpenMenuId(null);
    document.addEventListener('mousedown', handleDocumentMouseDown);
    return () => document.removeEventListener('mousedown', handleDocumentMouseDown);
  }, [openMenuId]);

  return (
    <aside className="flex h-full w-[248px] shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex h-[68px] items-center gap-3 border-b border-slate-200 px-4">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--psbc-green)] text-white shadow-sm">
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[var(--psbc-gold)] ring-2 ring-white" />
          <FileAudio size={20} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[15px] font-bold leading-tight text-slate-950">UAudioLab</div>
          <div className="mt-0.5 text-[11px] font-medium leading-none text-slate-500">音频工具平台</div>
        </div>
      </div>

      <nav className="space-y-1 border-b border-slate-200 px-3 py-2.5">
        {navItems.map(item => {
          const Icon = item.icon;
          const active = item.id === activeTab;
          return (
            <button
              key={item.id}
              onClick={() => onChangeTab(item.id)}
              className={`flex h-8 w-full items-center gap-2.5 rounded-lg px-3 text-[12px] font-semibold transition-colors ${
                active
                  ? 'bg-[var(--psbc-green-soft)] text-[var(--psbc-green)]'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Icon size={15} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <section className="border-b border-slate-200 px-3 py-2.5">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-[12px] font-semibold leading-none text-slate-600">文件库</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setIsCustomLibrariesCollapsed(false);
                setIsCreatingLibrary(true);
              }}
              className="icon-button h-6 w-6"
              title="新建文件库"
            >
              <Plus size={14} />
            </button>
            <button onClick={onOpenGlobalSettings} className="icon-button h-6 w-6" title="分析设置">
              <Settings size={14} />
            </button>
          </div>
        </div>
        <div className="space-y-0.5">
          {categoryItems.map(item => {
            const Icon = item.icon;
            const active = item.id === activeCategory && !activeCollectionId;
            return (
              <button
                key={item.id}
                onClick={() => onChangeCategory(item.id)}
                className={`flex h-7 w-full items-center justify-between rounded-md px-2 text-[11.5px] font-medium transition-colors ${
                  active ? 'bg-[var(--psbc-green-soft)] text-[var(--psbc-green)]' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Icon size={13} />
                  {item.label}
                </span>
                <span className="text-[11px] text-slate-400">{categoryCounts[item.id]}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 border-t border-slate-100 pt-2">
          <button
            type="button"
            onClick={() => setIsCustomLibrariesCollapsed(prev => !prev)}
            aria-expanded={!isCustomLibrariesCollapsed}
            className="mb-1 flex h-6 w-full items-center justify-between rounded-md px-1 text-[10.5px] font-semibold text-slate-400 hover:bg-slate-50 hover:text-slate-600"
          >
            <span>自定义文件库</span>
            <span className="flex items-center gap-1">
              <span>{collections.length}</span>
              <ChevronRight size={12} className={`transition-transform ${isCustomLibrariesCollapsed ? '' : 'rotate-90'}`} />
            </span>
          </button>
          {!isCustomLibrariesCollapsed && isCreatingLibrary && (
            <div className="mb-1 flex h-7 items-center gap-1 rounded-md border border-[var(--psbc-green-line)] bg-white px-1.5">
              <input
                value={newLibraryName}
                onChange={(event) => setNewLibraryName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitLibrary();
                  if (event.key === 'Escape') cancelLibrary();
                }}
                autoFocus
                className="min-w-0 flex-1 bg-transparent text-[11.5px] text-slate-700 outline-none placeholder:text-slate-400"
                placeholder="文件库名称"
              />
              <button onClick={submitLibrary} className="rounded p-0.5 text-[var(--psbc-green)] hover:bg-[var(--psbc-green-soft)]" title="确认">
                <Check size={12} />
              </button>
              <button onClick={cancelLibrary} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="取消">
                <X size={12} />
              </button>
            </div>
          )}
          {!isCustomLibrariesCollapsed && (
          <div data-testid="custom-library-scroll" className="max-h-[150px] overflow-y-auto space-y-0.5 pr-0.5">
            {collections.length === 0 ? (
              <button
                onClick={() => setIsCreatingLibrary(true)}
                className="flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-left text-[11.5px] font-medium text-slate-500 hover:bg-slate-50"
              >
                <Folder size={13} />
                新建文件库
              </button>
            ) : collections.map(collection => {
              const active = collection.id === activeCollectionId;
              return (
                <div
                  key={collection.id}
                  className={`group/library flex h-7 w-full items-center justify-between rounded-md px-2 text-[11.5px] font-medium transition-colors ${
                    active ? 'bg-[var(--psbc-green-soft)] text-[var(--psbc-green)]' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <button
                    onClick={() => onChangeCollection(collection.id)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                    title={collection.name}
                  >
                    <Folder size={13} />
                    <span className="truncate">{collection.name}</span>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="text-[11px] text-slate-400">{collectionCounts.get(collection.id) || 0}</span>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteLibrary(collection.id);
                      }}
                      className="rounded p-0.5 text-slate-300 transition hover:bg-red-50 hover:text-red-600"
                      title="删除文件库"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="text-[12px] font-semibold leading-none text-slate-600">
            文件列表
          </div>
          <button onClick={onBrowseFiles} className="icon-button h-7 w-7" title="添加音频">
            <Upload size={14} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
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
          {filteredItems.length > 0 && (
            <div className="space-y-1">
              {filteredItems.map(item => {
                const selected = item.id === selectedFileId;
                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => (liveIds.has(item.id) ? onSelectFile(item.id) : onSelectLibraryItem(item.id))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        liveIds.has(item.id) ? onSelectFile(item.id) : onSelectLibraryItem(item.id);
                      }
                    }}
                    className={`group relative rounded-lg border px-2 py-1.5 transition-all ${
                      selected
                        ? 'border-[var(--psbc-green-line)] bg-[var(--psbc-green-soft)]'
                        : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                        <FileAudio size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] font-semibold leading-tight text-slate-800" title={item.name}>{item.name}</div>
                        <div className="mt-0.5 text-[10.5px] leading-tight text-slate-500">
                          {formatDuration(item.duration)} · {item.segmentCount ? `${item.segmentCount} 片段` : formatBytes(item.size)}
                        </div>
                      </div>
                      <button
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenMenuId(openMenuId === item.id ? null : item.id);
                        }}
                        className="mt-0.5 shrink-0 rounded p-1 text-slate-400 opacity-100 transition-colors hover:bg-white hover:text-slate-700"
                        title="更多操作"
                      >
                        <MoreHorizontal size={13} />
                      </button>
                    </div>

                    <div className="mt-1.5 flex items-center justify-between">
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          item.status === FileStatus.ERROR
                            ? 'bg-red-50 text-red-600'
                            : item.status === FileStatus.ANALYZING
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {statusLabel[item.status]}
                      </span>
                      {item.isFavorite && <Star size={12} className="text-[var(--psbc-gold)]" fill="currentColor" />}
                    </div>
                    {item.error && <div className="mt-1 truncate text-[10px] text-red-500">{item.error}</div>}
                    {openMenuId === item.id && (
                      <div
                        className="absolute right-2 top-8 z-30 w-40 rounded-lg border border-slate-200 bg-white p-1 text-[11px] shadow-lg"
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {activeCategory === 'trash' ? (
                          <>
                            <button onClick={() => { onRestore(item.id); setOpenMenuId(null); }} className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-slate-700 hover:bg-slate-50">
                              <RotateCcw size={12} /> 恢复
                            </button>
                            <button onClick={() => { onPermanentDelete(item.id); setOpenMenuId(null); }} className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-red-600 hover:bg-red-50">
                              <Trash2 size={12} /> 彻底删除
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => { onToggleFavorite(item.id); setOpenMenuId(null); }} className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-slate-700 hover:bg-slate-50">
                              <Star size={12} /> {item.isFavorite ? '取消收藏' : '收藏'}
                            </button>
                            {item.status === FileStatus.COMPLETED && (
                              <button onClick={() => { onReanalyze(item.id); setOpenMenuId(null); }} className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-slate-700 hover:bg-slate-50">
                                <RefreshCw size={12} /> 重新分析
                              </button>
                            )}
                            {item.status === FileStatus.ERROR && (
                              <button onClick={() => { onRetry(item.id); setOpenMenuId(null); }} className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-slate-700 hover:bg-slate-50">
                                <RefreshCw size={12} /> 重试
                              </button>
                            )}
                            <button onClick={() => { onOpenFileSettings(item.id); setOpenMenuId(null); }} className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-slate-700 hover:bg-slate-50">
                              <Settings size={12} /> 文件配置
                            </button>
                            <div className="my-1 border-t border-slate-100" />
                            <div className="px-2 py-1 text-[10px] font-semibold text-slate-400">移动到</div>
                            <button onClick={() => { onMoveToLibrary(item.id, null); setOpenMenuId(null); }} className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-slate-700 hover:bg-slate-50">
                              <Archive size={12} /> 未分组
                            </button>
                            <div data-testid="move-library-scroll" className="max-h-[132px] overflow-y-auto pr-0.5">
                              {collections.map(collection => (
                                <button key={collection.id} onClick={() => { onMoveToLibrary(item.id, collection.id); setOpenMenuId(null); }} className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-slate-700 hover:bg-slate-50">
                                  <Folder size={12} /> <span className="truncate">{collection.name}</span>
                                </button>
                              ))}
                            </div>
                            <div className="my-1 border-t border-slate-100" />
                            <button onClick={() => { onDelete(item.id); setOpenMenuId(null); }} className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-red-600 hover:bg-red-50">
                              <Trash2 size={12} /> 移到回收站
                            </button>
                            <button onClick={() => { onPermanentDelete(item.id); setOpenMenuId(null); }} className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-red-600 hover:bg-red-50">
                              <Trash2 size={12} /> 直接删除记录
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </aside>
  );
};

export default AudioFileSidebar;
